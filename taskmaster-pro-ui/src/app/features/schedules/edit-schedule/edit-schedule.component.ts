import { ChangeDetectorRef , Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, take, finalize, takeUntil } from 'rxjs/operators'
import { CommonModule } from '@angular/common';
import { AbstractControl, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router, ActivatedRoute  } from '@angular/router';
import { MaterialModule } from '../../../shared/modules/material.module';
import { NgSelectModule } from '@ng-select/ng-select';
import { UpdateScheduleDto } from '../../../shared/models/schedule';
import { UserDto } from '../../../shared/models/user.dto';
import { AuthService } from '../../authentication/services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { OrderService } from '../../../core/services/order.service';
import { ScheduleService } from '../../../core/services/schedule.service';
import { UserService } from '../../users/user.service';
import { toIsoMidnight } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-edit-schedule',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
    NgSelectModule
  ],
  templateUrl: './edit-schedule.component.html',
  styleUrls: ['./edit-schedule.component.scss']
})
export class EditScheduleComponent implements OnInit, OnDestroy {
  editForm!: FormGroup;
  isSubmitting = false;
  scheduleId!: string;
  private destroy$ = new Subject<void>();
  private pointerSubmitInProgress = false;

  // Typeahead/observables
  userTypeahead$ = new Subject<string>();
  userList: UserDto[] = [];
  isOrderValid = false;
  validatingAssigned = false;

  // Typeahead/search config
  searchMinLength = 3;
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

  ngOnInit(): void {
    // Initialize the form
    this.editForm = this.fb.group({
      orderId:        ['', Validators.required],
      title:          ['', [Validators.required, Validators.maxLength(250)]],
      scheduledStart: [new Date(), [Validators.required, this.startNotBeforeMidnightValidator]],
      scheduledEnd:   [new Date(), Validators.required],
      description:    ['', [Validators.required, Validators.maxLength(1000)]],
      assignedTo:     [null]   
      }, { validators: this.endAfterStartValidator(this.nextMidnight) });

    // Server-side autocomplete for users: debounce + minimum lengthes
    this.userTypeahead$.pipe(
      takeUntil(this.destroy$),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        const str = (term || '').toString().trim();
        if (str.length < this.searchMinLength) {
          this.searchTooShortUser = true;
          return of([] as UserDto[]);
        }
        this.searchTooShortUser = false;
        return this.userService.searchUsers(str).pipe(
          catchError(() => of([] as UserDto[]))
        );
      })
    ).subscribe(list => {
      // Cache returned users
      list.forEach(u => this.userCache.set(u.id, u));

      // Include currently selected user when it matches typed text
      const typed = this.assignedTo.value;
      let merged = [...list];
      if (this.selectedUser && typeof typed === 'string' &&
          this.selectedUser.email.toLowerCase().includes(typed.toLowerCase())) {
        merged.unshift(this.selectedUser);
      }

      // Dedupe results and update ng-select list
      this.userList = Array.from(new Map(merged.map(u => [u.id, u])).values());
      this.cdr.detectChanges();
    });

    // Watch control changes and push typed strings into the typeahead subject
    this.assignedTo.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => {
        if (typeof v === 'string') {
          this.userTypeahead$.next(v);
        } else if (v && typeof v === 'object' && (v as UserDto).id) {
          // If the control contains a full user object (selected), cache it
          const u = v as UserDto;
          this.userCache.set(u.id, u);
        }
      });

    // Initialize Current User / Role
    this.authService.isAdmin$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(isAdmin => {
      this.isAdmin = isAdmin;
      this.currentUserId = this.authService.getCurrentUser()?.id ?? null;
      this.scheduleId = this.route.snapshot.paramMap.get('id')!;

      // Get the schedule with the id provided in the route
      this.scheduleService.getById(this.scheduleId).pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.cdr.detectChanges();
        })
      ).subscribe(schedule => {
        this.editForm.patchValue(schedule);
        this.validateOrderId(this.editForm.get('orderId')?.value);

        // Normalize: get assigned id whether `assignedTo` is string or object
        const assigned = schedule.assignedTo;
        const assignedId = assigned
          ? (typeof assigned === 'string' ? assigned : (assigned as UserDto).id)
          : null;

        if (!assignedId) {
          return;
        }

        // Fetch the full user object
        this.userService.getById(assignedId).pipe(
          take(1),
          catchError(() => of(null))
        ).subscribe(fullUser => {
          if (!fullUser) {
            // Fallback - if API didn't return full user but schedule already had object
            if (assigned && typeof assigned !== 'string') {
              const partial = assigned as UserDto;
              this.userCache.set(partial.id, partial);
              if (!this.userList.some(u => u.id === partial.id)) this.userList.unshift(partial);
              this.selectedUser = partial;
              this.assignedTo.setValue(partial, { emitEvent: false });
            }
            this.cdr.detectChanges();
            return;
          }

          // Put full user into cache and list *before* setting control value
          this.userCache.set(fullUser.id, fullUser);
          const idx = this.userList.findIndex(u => u.id === fullUser.id);
          if (idx >= 0) this.userList[idx] = fullUser;
          else this.userList.unshift(fullUser);

          // Set control to the full object AFTER it's in userList/cache
          this.assignedTo.setValue(fullUser, { emitEvent: false });
          
          this.cdr.detectChanges();
        });
      });

      // Disable the assignedTo control for non-admin users
      if (!this.isAdmin) this.assignedTo.disable({ emitEvent: false });
        else this.assignedTo.enable({ emitEvent: false });

      // If there is a currentUserId, fetch the user object and set selectedUser
      if (this.currentUserId) {
        if (!this.isAdmin && this.currentUserId && !this.assignedTo.value) {
          this.userService.getById(this.currentUserId).pipe(
            takeUntil(this.destroy$),
            catchError(() => of(null))
          ).subscribe(u => {
            if (u) {
              this.userCache.set(u.id, u);
              this.selectedUser = u;
              this.assignedTo.setValue(u, { emitEvent: false });
              this.cdr.detectChanges();
            }
          });
        }
      }

      // Prefill orderId from query param (if present)
      const q = this.route.snapshot.queryParamMap.get('orderId');
      if (q) {
        this.orderId.setValue(q);
        this.validateOrderId(q);
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
      this.editForm.markAllAsTouched();
      return;
    }

    // Prevent multiple submits
    if (this.editForm.invalid) {
      // Mark touched so mat-error appears
      this.editForm.markAllAsTouched();
      return;
    }

    // Final check: ensure order id validated
    if (!this.isOrderValid) {
      this.notification.show('Order ID is invalid or not found.', 'Close');
      return;
    }

    // Extract assignedToId from assignedTo property
    const assignedValue = this.editForm.value.assignedTo;
    const assignedToId = this.isAdmin
      ? (assignedValue && typeof assignedValue === 'object' ? assignedValue.id : assignedValue)
      : this.currentUserId;
  
    this.isSubmitting = true;
    const dto: UpdateScheduleDto = {
      id:             this.scheduleId,
      orderId:        this.editForm.value.orderId,
      title:          this.editForm.value.title,
      scheduledStart: toIsoMidnight(this.editForm.value.scheduledStart),
      scheduledEnd:   toIsoMidnight(this.editForm.value.scheduledEnd),
      description:    this.editForm.value.description,
      assignedToId:   assignedToId
    };

    this.scheduleService.update(this.scheduleId, dto).subscribe({
      next: () => {
        this.notification.show('Schedule edited!');
        this.router.navigate(['/schedules']);
      },
      error: () => {
        this.notification.show('Failed to edit schedule', 'Close');
        this.isSubmitting = false;
      }
    });
  }

  cancel() {
    this.router.navigate(['/schedules']);
  }

  // Validate single Order ID on-demand (called after paste or explicit action)
  validateOrderId(id: string) {
    if (!id) return;
    this.orderService.exists(id).pipe(
      takeUntil(this.destroy$),
      catchError(() => of(false))
    ).subscribe(exists => {
      this.isOrderValid = !!exists;
      if (!exists) {
        this.editForm.get('orderId')?.setErrors({ notFound: true });
      } else {
        // clear errors
        const ctrl = this.editForm.get('orderId');
        if (ctrl?.hasError('notFound')) ctrl.setErrors(null);
      }
    });
  }

  // Display helper for user autocomplete
  displayUser(user: UserDto | string | null): string {
    if (!user) return '';
    let u: UserDto | undefined;
    
    if (typeof user === 'string') {
        u = this.userCache.get(user);
        if (!u) return user;
    } else {
        u = user;
    }

    const name = u.fullName?.trim();
    return name ? `${u.email} - ${name}` : u.email;
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
        const ctrl = this.editForm.get('assignedTo');
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
    return this.editForm.get('orderId')!;
  }
  get title() {
    return this.editForm.get('title')!;
  }
  get scheduledStart() {
    return this.editForm.get('scheduledStart')!;
  }
  get scheduledEnd() {
    return this.editForm.get('scheduledEnd')!;
  }
  get description() {
    return this.editForm.get('description')!;
  }
  get assignedTo()  {
    return this.editForm.get('assignedTo')!;
  }
  get nextMidnight(): Date {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // next day 00:00
    return midnight;
  }
}
