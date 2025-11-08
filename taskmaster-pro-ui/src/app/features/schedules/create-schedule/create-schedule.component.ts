  import { ChangeDetectorRef , Component, OnInit, OnDestroy, NgZone } from '@angular/core';
  import { Subject, Observable, of } from 'rxjs';
  import { debounceTime, distinctUntilChanged, switchMap, catchError, tap, finalize, takeUntil } from 'rxjs/operators'
  import { CommonModule } from '@angular/common';
  import { AbstractControl, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
  import { Router, ActivatedRoute  } from '@angular/router';
  import { MaterialModule } from '../../../shared/modules/material.module';
  import { NgSelectModule } from '@ng-select/ng-select';
  import { CreateScheduleDto } from '../../../shared/models/schedule';
  import { UserDto } from '../../../shared/models/user.dto';
  import { AuthService } from '../../authentication/services/auth.service';
  import { NotificationService } from '../../../shared/services/notification.service';
  import { OrderService } from '../../../core/services/order.service';
  import { ScheduleService } from '../../../core/services/schedule.service';
  import { UserService } from '../../users/user.service';
  import { toIsoMidnight } from '../../../shared/utils/date-utils';

  @Component({
    selector: 'app-create-schedule',
    standalone: true,
    imports: [
      CommonModule,
      ReactiveFormsModule,
      MaterialModule,
      NgSelectModule
    ],
    templateUrl: './create-schedule.component.html',
    styleUrls: ['./create-schedule.component.scss']
  })
  export class CreateScheduleComponent implements OnInit, OnDestroy {
    scheduleForm!: FormGroup;
    isSubmitting = false;
    private destroy$ = new Subject<void>();
    private pointerSubmitInProgress = false;
    private isInitialized = false;

    // Typeahead/observables
    orderSuggestions$: Observable<any[]> = of([]);
    userTypeahead$ = new Subject<string>();
    userList: UserDto[] = [];
    validatingOrder = false;
    isOrderValid = false;
    validatingAssigned = false;

    // Typeahead/search config
    searchMinLength = 3;
    searchTooShortOrder = false;
    searchTooShortUser  = false;

    // Clipboard support detection
    clipboardSupported = !!(navigator && (navigator as any).clipboard && (navigator as any).clipboard.readText && (navigator as any).clipboard.writeText);

    // Cache for quick display lookup of users by ID
    private userCache = new Map<string, UserDto>();
    selectedUser: UserDto | null = null;

    // Current user info
    isAdmin = false;
    currentUserId: string | null = null;
    
    constructor(
      private fb: FormBuilder,
      private authService: AuthService,
      private notification: NotificationService,
      private orderService: OrderService,
      private scheduleService: ScheduleService,
      private userService: UserService,
      private router: Router,
      private route: ActivatedRoute,
      private cdr: ChangeDetectorRef,
      private ngZone: NgZone
    ) {}

    ngOnInit() {
      // Initialize the form
      this.scheduleForm = this.fb.group({
          orderId:        ['', Validators.required],
          title:          ['', [Validators.required, Validators.maxLength(250)]],
          scheduledStart: [new Date(), [Validators.required, this.startNotBeforeMidnightValidator]],
          scheduledEnd:   [new Date(), Validators.required],
          description:    ['', [Validators.required, Validators.maxLength(1000)]],
          assignedTo:     [null]
      }, { validators: this.endAfterStartValidator(this.nextMidnight) });

      // Initialize Current User / Role
      this.authService.isAdmin$.pipe(
        takeUntil(this.destroy$)
      ).subscribe(isAdmin => {
        this.isAdmin = isAdmin;
        this.currentUserId = this.authService.getCurrentUser()?.id ?? null;

        if (!this.isInitialized) {
          // assignedTo field: required only for admins
          if (this.isAdmin) {
            this.assignedTo.setValidators([Validators.required]);
          } else {
            this.assignedTo.clearValidators();
          }
          this.assignedTo.updateValueAndValidity({ emitEvent: false });

          // Disable the assignedTo control for non-admin users
          if (!this.isAdmin) this.assignedTo.disable({ emitEvent: false });
            else this.assignedTo.enable({ emitEvent: false });

          // If there is a currentUserId, fetch the user object and set selectedUser
          if (this.currentUserId) {
            this.userService.getById(this.currentUserId).pipe(
              takeUntil(this.destroy$),
              catchError(() => of(null))
            ).subscribe(u => {
              if (u) {
                this.userCache.set(u.id, u);
                this.selectedUser = u;
                this.assignedTo.setValue(u, { emitEvent: false });
                if (!this.userList.some(x => x.id === u.id)) this.userList.unshift(u);
                this.cdr.detectChanges();
              }
            });
          }

          // Prefill orderId from query param (if present)
          const q = this.route.snapshot.queryParamMap.get('orderId');
          if (q) {
            this.orderId.setValue(q);
            this.validateOrderId(q);
          }

          // Trigger API search from typing
          this.userTypeahead$
            .pipe(
              takeUntil(this.destroy$),
              debounceTime(300),
              distinctUntilChanged(),
              switchMap(term => {
                if (!term || term.length < this.searchMinLength) {
                  this.searchTooShortUser = true;
                  return of([]);
                }
                this.searchTooShortUser = false;
                return this.userService.searchUsers(term).pipe(
                  catchError(() => of([]))
                );
              })
            )
            .subscribe(list => {
              let filtered = [...list];
              if (this.selectedUser && this.selectedUser.email.toLowerCase().includes(this.assignedTo.value?.toString().toLowerCase() || '')) {
                filtered.push(this.selectedUser);
              }
              this.userList = Array.from(new Map(filtered.map(u => [u.id, u])).values());
            });

          this.assignedTo.valueChanges
          .pipe(takeUntil(this.destroy$))
          .subscribe(v => {
            if (typeof v === 'string') this.userTypeahead$.next(v);
          });
            
          // Server-side autocomplete for orders: debounce + minimum length
          this.orderSuggestions$ = this.orderId.valueChanges.pipe(
            takeUntil(this.destroy$),
            debounceTime(300),
            distinctUntilChanged(),
            switchMap(val => {
              const str = val?.toString().trim() || '';
              if (str.length < this.searchMinLength) {
                this.searchTooShortOrder = true; // show warning in template
                return of([]);
              } else {
                this.searchTooShortOrder = false;
                return this.orderService.searchOrders(str).pipe(
                  catchError(() => of([]))
                );
              }
            })
          );

          // Validate on pause/blur-ish behavior: when value stabilizes, check existence
          this.orderId.valueChanges.pipe(
            takeUntil(this.destroy$),
            debounceTime(700),
            distinctUntilChanged(),
            tap(val => {
              // Reset validation display until proven
              this.isOrderValid = false;
              this.validatingOrder = true;             // <-- Show spinner/hint while checking
              if (!val || val.toString().trim().length === 0) {
                this.scheduleForm.get('orderId')?.setErrors({ required: true });
                this.validatingOrder = false;         // Stop validating if empty
              }
            }),
            switchMap(val => {
              if (!val || val.toString().trim().length === 0) return of(null);
              return this.orderService.exists(val.toString()).pipe(
                catchError(() => of(false))
              );
            })
          ).subscribe(result => {
            if (result === null) {
              // Nothing to do
              this.validatingOrder = false;
              return;
            }
            this.validatingOrder = false;
            if (result === true) {
              this.isOrderValid = true;
              // Clear notFound error if any
              const ctrl = this.scheduleForm.get('orderId');
              if (ctrl?.hasError('notFound')) ctrl.setErrors(null);
            } else {
              this.isOrderValid = false;
              this.scheduleForm.get('orderId')?.setErrors({ notFound: true });
            }
          });
          this.isInitialized = true;
        } else {
          // Update assignedTo field if isAdmin changed
          this.assignedTo.setValue(this.isAdmin ? '' : this.currentUserId);
        }
      });
    }

    ngOnDestroy(): void {
      this.destroy$.next();
      this.destroy$.complete();
    }

    async submit() {
      this.cdr.detectChanges();

      // Force assignedTo validation
      const assignedValid = await this.validateAssignedTo(this.assignedTo.value);

      if (!assignedValid) {
        this.notification.show('Assigned To is invalid or not found.', 'Close');
        this.scheduleForm.markAllAsTouched();
        return;
      }
    
      // Prevent multiple submits
      if (this.scheduleForm.invalid) {
        // Mark touched so mat-error appears
        this.scheduleForm.markAllAsTouched();
        return;
      }

      // Final check: ensure order id validated
      if (!this.isOrderValid) {
        this.notification.show('Order ID is invalid or not found.', 'Close');
        return;
      }

      // Extract assignedToId from assignedTo property
      const assignedValue = this.scheduleForm.value.assignedTo;
      const assignedToId = this.isAdmin
        ? (assignedValue && typeof assignedValue === 'object' ? assignedValue.id : assignedValue)
        : this.currentUserId;

      this.isSubmitting = true;

      const dto: CreateScheduleDto = {
        orderId:        this.scheduleForm.value.orderId,
        title:          this.scheduleForm.value.title,
        scheduledStart: toIsoMidnight(this.scheduleForm.value.scheduledStart),
        scheduledEnd:   toIsoMidnight(this.scheduleForm.value.scheduledEnd),
        description:    this.scheduleForm.value.description,
        assignedToId:   assignedToId
      };

      this.scheduleService.create(dto).subscribe({
        next: () => {
          this.notification.show('Schedule created!');
          this.router.navigate(['/schedules']);
        },
        error: () => {
          this.notification.show('Failed to create schedule', 'Close');
          this.isSubmitting = false;
        }
      });
    }

    cancel() {
      this.router.navigate(['/schedules']);
    }

    // Called when the user selects an autocomplete option for Order ID
    onOrderSelected(orderId: string) {
      this.orderId.setValue(orderId);
      this.validateOrderId(orderId);
    }

    // Validate single Order ID on-demand (called after paste or explicit action)
    validateOrderId(id: string) {
      if (!id) return;
      this.validatingOrder = true;
      this.orderService.exists(id).pipe(
        takeUntil(this.destroy$),
        catchError(() => of(false))
      ).subscribe(exists => {
        this.validatingOrder = false;
        this.isOrderValid = !!exists;
        if (!exists) {
          this.scheduleForm.get('orderId')?.setErrors({ notFound: true });
        } else {
          // clear errors
          const ctrl = this.scheduleForm.get('orderId');
          if (ctrl?.hasError('notFound')) ctrl.setErrors(null);
        }
      });
    }

    // Display helper for user autocomplete
    displayUser(userId: string | null): string {
      if (!userId) return '';
      const u = this.userCache.get(userId) || (this.selectedUser && this.selectedUser.id === userId ? this.selectedUser : null);
      if (!u) return '';
      return `${u.email} - ${u.fullName || u.displayName || ''}`.trim();
    }

    // Called when the user selects an autocomplete option for Assigned To
    onUserSelected(selectedUser: UserDto | null) {
      if (!selectedUser) return;

      this.selectedUser = selectedUser;
      if (!this.userList.find(u => u.id === selectedUser.id)) {
        this.userList.unshift(selectedUser);
      }
      this.assignedTo.setValue(selectedUser, { emitEvent: false });
      this.validateAssignedTo(selectedUser);

      this.cdr.detectChanges();
    }

    // Validate single Assigned To on-demand (called after paste or explicit action)
    validateAssignedTo(val: string | UserDto | null): Promise<boolean> {
      return new Promise(resolve => {
        let id = '';
        if (!val) { resolve(false); return; }
        if (typeof val === 'string') id = val.trim();
        else id = (val as UserDto).id;
        if (!id) { resolve(false); return; }

        this.validatingAssigned = true;
        this.userService.existsCached(id).pipe(
          takeUntil(this.destroy$),
          catchError(() => of(false)),
          finalize(() => {
            this.validatingAssigned = false;
            this.cdr.detectChanges();
          })
        ).subscribe(exists => {
          const ctrl = this.scheduleForm.get('assignedTo');
          if (!exists) ctrl?.setErrors({ notFound: true });
          else ctrl?.updateValueAndValidity({ onlySelf: true });
          resolve(exists);
        });
      });
    }

    // Optional Paste helper (permission required on some browsers). Graceful fallback to notification.
    async pasteFromClipboard() {
      if (!this.clipboardSupported) {
        this.notification.show('Clipboard not supported in this browser.', 'Close');
        return;
      }
      try {
        const text = await (navigator as any).clipboard.readText();
        if (!text) {
          this.notification.show('Clipboard is empty.', 'Close');
          return;
        }
        this.orderId.setValue(text.trim());
        this.validateOrderId(text.trim());
      } catch (err) {
        this.notification.show('Could not read clipboard (permission denied).', 'Close');
      }
    }
    
    startNotBeforeMidnightValidator(control: AbstractControl) {
      const value = control.value;
      if (!value) return null;
      const date = new Date(value);
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0); // next day 00:00
      return date >= midnight ? null : { beforeMidnight: true };
    }

    endAfterStartValidator(min: Date) {
      return (group: FormGroup) => {
        const startCtrl = group.get('scheduledStart');
        const endCtrl = group.get('scheduledEnd');

        if (!startCtrl || !endCtrl) return null;

        const s = startCtrl.value ? new Date(startCtrl.value) : null;
        const e = endCtrl.value ? new Date(endCtrl.value) : null;

        if (!s || !e) return null;

        const errors = endCtrl.errors || {};

        if (e <= s || e < min) {
          errors['endBeforeStart'] = true;
          endCtrl.setErrors(errors);
        } else {
          if (errors['endBeforeStart']) {
            delete errors['endBeforeStart'];
            endCtrl.setErrors(Object.keys(errors).length ? errors : null);
          }
        }

        return null;
      };
    }

    addOneDay(date: Date | string): Date {
      const d = new Date(date);
      d.setDate(d.getDate() + 1);
      return d;
    }

    // Ensure ng-select internal handlers finished (microtask + macrotask)
    private async waitForNgSelectFinalize(): Promise<void> {
      await Promise.resolve();
      await new Promise(res => setTimeout(res, 0));
    }

    // Wait until control.status !== 'PENDING' or timeout
    private async waitUntilControlStable(control: AbstractControl | null, timeoutMs = 5000): Promise<'stable' | 'timeout'> {
      if (!control) return 'stable';
      if (control.status !== 'PENDING') return 'stable';
      const start = Date.now();
      return new Promise(resolve => {
        const sub = (control.statusChanges as any)?.subscribe?.((status: string) => {
          if (status !== 'PENDING') {
            sub?.unsubscribe?.();
            return resolve('stable');
          }
          if (Date.now() - start > timeoutMs) {
            sub?.unsubscribe?.();
            return resolve('timeout');
          }
        });
        // fallback poll
        const poll = () => {
          if (control.status !== 'PENDING') { sub?.unsubscribe?.(); return resolve('stable'); }
          if (Date.now() - start > timeoutMs) { sub?.unsubscribe?.(); return resolve('timeout'); }
          setTimeout(poll, 50);
        };
        poll();
      });
    }

    // A pointerup handler to coordinate validation and submission
    async onSavePointerUp(ev?: PointerEvent) {
      // Prevent double triggering
      if (this.pointerSubmitInProgress || this.isSubmitting) {
        if (ev) ev.preventDefault();
        return;
      }
      this.pointerSubmitInProgress = true;

      try {
        // Ensure any ng-select blur/selection handlers run first
        await this.waitForNgSelectFinalize();

        // Allow Angular zone to pick up changes before proceeding
        await this.ngZone.run(async () => {
          this.cdr.detectChanges();
        });

        // Wait for async validators to finish on assignedTo and orderId
        const assignedCtrl = this.assignedTo;
        const orderCtrl = this.orderId;

        const [assignedStable, orderStable] = await Promise.all([
          this.waitUntilControlStable(assignedCtrl, 5000),
          this.waitUntilControlStable(orderCtrl, 5000)
        ]);

        if (assignedStable === 'timeout' || orderStable === 'timeout') {
          this.notification.show('Validation timed out — try again.', 'Close');
          return;
        }

        // Finally, call submit if available
        if (typeof (this as any).submit === 'function') {
          await (this as any).submit();
        }
      } finally {
        this.pointerSubmitInProgress = false;
      }
    }

    // Keydown handler to submit on Enter key
    onKeydown(event: KeyboardEvent) {
      if (
        event.key === 'Enter' &&
        !this.pointerSubmitInProgress &&
        !this.isSubmitting &&
        !this.validatingAssigned
      ) {
        event.preventDefault();
        this.onSavePointerUp();
      }
    }
    
    // Getters for form controls
    get orderId() {
      return this.scheduleForm.get('orderId')!;
    }
    get title() {
      return this.scheduleForm.get('title')!;
    }
    get scheduledStart() {
      return this.scheduleForm.get('scheduledStart')!;
    }
    get scheduledEnd() {
      return this.scheduleForm.get('scheduledEnd')!;
    }
    get description() {
      return this.scheduleForm.get('description')!;
    }
    get assignedTo()  {
      return this.scheduleForm.get('assignedTo')!;
    }
    get nextMidnight(): Date {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0); // next day 00:00
      return midnight;
    }
  }