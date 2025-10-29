  import { ChangeDetectorRef , Component, OnInit } from '@angular/core';
  import { Subject, Observable, of, firstValueFrom } from 'rxjs';
  import { debounceTime, distinctUntilChanged, switchMap, catchError, tap, takeUntil } from 'rxjs/operators'
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
  export class CreateScheduleComponent implements OnInit {
    scheduleForm!: FormGroup;
    isSubmitting = false;
    private destroy$ = new Subject<void>();

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
      private cdr: ChangeDetectorRef
    ) {}

    ngOnInit() {
      // Initialize Current User / Role
      this.authService.isAdmin$.pipe(
        takeUntil(this.destroy$)
      ).subscribe(isAdmin => {
        this.isAdmin = isAdmin;
        this.currentUserId = this.authService.getCurrentUser()?.id ?? null;

        if (!this.scheduleForm) {
          // Initialize the form
          this.scheduleForm = this.fb.group({
              orderId:        ['', Validators.required],
              title:          ['', [Validators.required, Validators.maxLength(250)]],
              scheduledStart: [new Date(), [Validators.required, this.startNotBeforeMidnightValidator]],
              scheduledEnd:   [new Date(), Validators.required],
              description:    ['', [Validators.required, Validators.maxLength(1000)]],
              assignedTo:     [null]
          }, { validators: this.endAfterStartValidator(this.nextMidnight) });

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
      let assignedValue = this.isAdmin
        ? this.scheduleForm.value.assignedTo ?? this.selectedUser
        : this.currentUserId;

      if (!assignedValue) {
        this.scheduleForm.get('assignedTo')?.setErrors({ required: true });
        this.scheduleForm.markAllAsTouched();
        return;
      }

      // Normalize into an id string
      const assignedId = typeof assignedValue === 'object'
        ? assignedValue.id
        : assignedValue.toString().trim();

      if (!assignedId) {
        this.scheduleForm.get('assignedTo')?.setErrors({ required: true });
        this.scheduleForm.markAllAsTouched();
        return;
      }

      // Validate assigned user exists (async)
      const ok = await this.validateAssignedTo(assignedId);
      if (!ok) {
        this.scheduleForm.markAllAsTouched();
        return;
      }

      this._doSubmit(assignedId);
    }

    private _doSubmit(assignedToId: string | null) {
      // Guard again just in case
      if (!assignedToId) {
        this.notification.show('Assigned user missing.', 'Close');
        return;
      }

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

      // Set the control value, mark as dirty/touched and validate
      this.assignedTo.setValue(selectedUser);
      this.assignedTo.markAsDirty();
      this.assignedTo.markAsTouched();
      this.assignedTo.updateValueAndValidity();
      this.validateAssignedTo(selectedUser);

      this.cdr.detectChanges();
    }

    // Validate single Assigned To on-demand (called after paste or explicit action)
    async validateAssignedTo(val: string | UserDto | null): Promise<boolean> {
      let id = '';
      if (!val) return false;
      if (typeof val === 'string') id = val.trim();
      else id = (val as UserDto).id;

      if (!id) return false;

      this.validatingAssigned = true;
      try {
        const exists = await firstValueFrom(
          this.userService.exists(id).pipe(
            catchError(() => of(false))
          )
        );
        const ctrl = this.scheduleForm.get('assignedTo');
        if (!exists) ctrl?.setErrors({ notFound: true });
        else {
          if (ctrl?.hasError('notFound')) ctrl.updateValueAndValidity({ onlySelf: true });
        }

        return exists;
      } finally {
        this.validatingAssigned = false;
      }
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