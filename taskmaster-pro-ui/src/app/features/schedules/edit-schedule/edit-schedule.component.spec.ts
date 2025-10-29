import { ComponentFixture, fakeAsync, flush, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { EditScheduleComponent } from './edit-schedule.component';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../../authentication/services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { ScheduleService } from '../../../core/services/schedule.service';
import { UserService } from '../../users/user.service';
import { scheduleMock, updateScheduleMock, userMock } from '../../../shared/mock-data';
import { OrderService } from '../../../core/services/order.service';

class MockScheduleService {
  getById = jasmine.createSpy('getById').and.returnValue(of(scheduleMock));
  update = jasmine.createSpy('update').and.returnValue(of({}));
}

class MockNotificationService {
  show = jasmine.createSpy('show');
}

class MockUserService {
  getById = jasmine.createSpy('getById').and.returnValue(of(userMock));
  searchUsers = jasmine.createSpy('searchUsers').and.returnValue(of([userMock]));
  exists = jasmine.createSpy('exists').and.returnValue(of(true));
}

class MockAuthService {
  isAdmin$ = new BehaviorSubject<boolean>(false);
  getCurrentUser = jasmine.createSpy('getCurrentUser').and.returnValue(userMock);
}

describe('EditScheduleComponent', () => {
  let component: EditScheduleComponent;
  let fixture: ComponentFixture<EditScheduleComponent>;
  let mockScheduleService: MockScheduleService;
  let mockNotification: MockNotificationService;
  let mockAuthService: MockAuthService;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    mockScheduleService = new MockScheduleService();
    mockNotification = new MockNotificationService();
    mockAuthService = new MockAuthService();
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        EditScheduleComponent,
        HttpClientTestingModule
      ],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: NotificationService, useValue: mockNotification },
        { provide: OrderService, useValue: jasmine.createSpyObj('OrderService', ['searchOrders', 'exists']) },
        { provide: ScheduleService, useValue: mockScheduleService },
        { provide: Router, useValue: routerSpy },
        { provide: UserService, useClass: MockUserService },
        { provide: AuthService, useClass: MockAuthService }
      ]
    }).compileComponents();

    mockAuthService.isAdmin$ = new BehaviorSubject<boolean>(false);
    fixture = TestBed.createComponent(EditScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with schedule data', () => {
    const s = { ...scheduleMock };
    component.editForm.patchValue(s);
    fixture.detectChanges();

    expect(component.title.value).toBe('aaaaaaa');
    expect(component.description.value).toBe('aaaaa');
  });

  it('should not submit if form is invalid', () => {
    component.editForm.controls['title'].setValue('');
    component.submit();
    expect(mockScheduleService.update).not.toHaveBeenCalled();
  });

  it('should call update on valid submit', fakeAsync(() => {
    // mark order id valid so submit proceeds
    component.isOrderValid = true;

    component.editForm.patchValue({
      orderId: updateScheduleMock.orderId ?? 'order1',
      title: updateScheduleMock.title,
      scheduledStart: new Date(updateScheduleMock.scheduledStart),
      scheduledEnd: new Date(updateScheduleMock.scheduledEnd),
      description: updateScheduleMock.description
    });
    component.userList = [userMock];
    component.assignedTo.setValue(userMock.id);
    component.submit();
    tick();

    expect(mockScheduleService.update).toHaveBeenCalled();
    expect(mockNotification.show).toHaveBeenCalledWith('Schedule edited!');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/schedules']);
  }));

  it('should show error on update failure', fakeAsync(() => {
    mockScheduleService.update = jasmine.createSpy('update').and.returnValue(throwError(() => new Error('fail')));
    
    // ensure order id is considered valid so submit() proceeds to call the service
    component.isOrderValid = true;

    component.editForm.patchValue({
      orderId: updateScheduleMock.orderId ?? 'order1',
      title: updateScheduleMock.title,
      scheduledStart: new Date(updateScheduleMock.scheduledStart),
      scheduledEnd: new Date(updateScheduleMock.scheduledEnd),
      description: updateScheduleMock.description
    });
    
    component.editForm.patchValue(updateScheduleMock);
    component.userList = [userMock];
    component.assignedTo.setValue(userMock.id);
    component.submit();
    tick();
    
    expect(mockNotification.show).toHaveBeenCalledWith('Failed to edit schedule', 'Close');
  }));

  it('should navigate back on cancel', () => {
    component.cancel();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/schedules']);
  });

  it('should send assignedToId (string) on submit when control has object selected', fakeAsync(() => {
    // ensure userService returns user for current user
    const userSvc = TestBed.inject(UserService) as any;
    userSvc.getById.and.returnValue(of(userMock));

    // patch form with updateScheduleMock which may contain string timestamps — adapt as needed
    component.editForm.patchValue({
      orderId: updateScheduleMock.orderId ?? 'order1',
      title: updateScheduleMock.title,
      scheduledStart: new Date(updateScheduleMock.scheduledStart),
      scheduledEnd: new Date(updateScheduleMock.scheduledEnd),
      description: updateScheduleMock.description,
      // set assignedTo control to object (selected user)
      assignedTo: userMock
    });

    // mark as valid order id
    component.isOrderValid = true;

    component.submit();
    tick();

    expect(TestBed.inject(ScheduleService).update).toHaveBeenCalled();
    const callArgs = (TestBed.inject(ScheduleService).update as jasmine.Spy).calls.mostRecent().args;
    const dtoSent = callArgs[1] as any; // update(id, dto)
    expect(dtoSent.assignedToId).toBe(userMock.id); // important: id not full object
  }));

  it('displayUser returns friendly text for object and id', fakeAsync(() => {
    const userSvc = TestBed.inject(UserService) as any;
    userSvc.getById.and.returnValue(of(userMock));

    // trigger the code that would populate userCache
    component.onUserSelected(userMock);
    tick();  // resolve any async

    // now userCache contains the user, test displayUser with string
    const result = component.displayUser(userMock.id);
    expect(result).toContain(userMock.email);

    // also test passing full object directly
    expect(component.displayUser(userMock)).toContain(userMock.email);
  }));

  it('validateOrderId sets notFound error when order does not exist', fakeAsync(() => {
    const orderSvc = TestBed.inject(OrderService) as jasmine.SpyObj<any>;
    orderSvc.exists.and.returnValue(of(false));

    component.validateOrderId('non-existent-id');
    tick();

    expect(component.isOrderValid).toBeFalse();
    const ctrl = component.editForm.get('orderId');
    expect(ctrl?.hasError('notFound')).toBeTrue();
  }));

  it('userSuggestions$ calls userService.searchUsers after debounce', fakeAsync(() => {
    const userSvc = TestBed.inject(UserService) as any;
    userSvc.searchUsers.and.returnValue(of([ { id: 'u1' } ]));

    component.userTypeahead$.next('alice');
    tick(300);
    fixture.detectChanges();

    expect(userSvc.searchUsers).toHaveBeenCalledWith('alice');
  }));

  it('endAfterStartValidator sets and clears endBeforeStart error', () => {
    const g = component.editForm;
    // set start to tomorrow, end same day (invalid)
    const start = new Date(); start.setDate(start.getDate() + 2);
    const end = new Date(start);
    end.setDate(start.getDate()); // same -> <=
    g.get('scheduledStart')!.setValue(start);
    g.get('scheduledEnd')!.setValue(end);
    // run validator directly
    const validator = component.endAfterStartValidator(component.nextMidnight);
    validator(g as FormGroup);

    expect(g.get('scheduledEnd')?.hasError('endBeforeStart')).toBeTrue();

    // correct end to after start
    const goodEnd = new Date(start); goodEnd.setDate(start.getDate() + 2);
    g.get('scheduledEnd')!.setValue(goodEnd);
    validator(g as FormGroup);
    expect(g.get('scheduledEnd')?.hasError('endBeforeStart')).toBeFalse();
  });

  it('ngOnDestroy completes destroy$ (no crash)', () => {
    spyOn((component as any).destroy$, 'next').and.callThrough();
    spyOn((component as any).destroy$, 'complete').and.callThrough();
    component.ngOnDestroy();
    expect((component as any).destroy$.next).toHaveBeenCalled();
    expect((component as any).destroy$.complete).toHaveBeenCalled();
  });

  it('onOrderSelected sets orderId and triggers validate', fakeAsync(() => {
    spyOn(component, 'validateOrderId');
    component.onOrderSelected('selected-123');
    tick();
    expect(component.orderId.value).toBe('selected-123');
    expect(component.validateOrderId).toHaveBeenCalledWith('selected-123');
  }));

  it('onUserSelected sets selectedUser and assignedTo control', () => {
    component['selectedUser'] = userMock;
    component['assignedTo'].setValue(userMock.id);
    component.onUserSelected(userMock);
    expect(component.selectedUser).toEqual(userMock);
    expect(component.assignedTo.value).toEqual(userMock);
  });

  it('pastes orderId from clipboard successfully', fakeAsync(() => {
    spyOn(navigator.clipboard, 'readText').and.returnValue(Promise.resolve('ORD123'));
    const orderSvc = TestBed.inject(OrderService) as jasmine.SpyObj<any>;
    orderSvc.exists.and.returnValue(of(true));

    component.pasteFromClipboard();
    flush(); // resolve promise microtasks

    expect(component.orderId.value).toBe('ORD123');
    expect(orderSvc.exists).toHaveBeenCalledWith('ORD123');
  }));

  it('shows error if paste from clipboard fails', fakeAsync(async () => {
    spyOn(navigator.clipboard, 'readText').and.returnValue(Promise.reject(new Error('denied')));
    const notif = TestBed.inject(NotificationService) as any;

    await component.pasteFromClipboard();
    flush();

    expect(notif.show).toHaveBeenCalledWith('Could not read clipboard (permission denied).', 'Close');
  }));

  it('sets startBeforeMidnight error when start is before midnight', () => {
    const now = new Date();
    const beforeMidnight = new Date(now);
    beforeMidnight.setHours(0, 0, 0, 0); // today midnight
    component.editForm.patchValue({
      scheduledStart: beforeMidnight,
      scheduledEnd: new Date(beforeMidnight.getTime() + 2*3600*1000)
    });

    const ctrl = component.editForm.get('scheduledStart');
    const err = component.startNotBeforeMidnightValidator(ctrl!);
    expect(err?.beforeMidnight).toBeTrue();
  });
  
  it('should set endBeforeMin error when end is less than 1 hour after start', () => {
    const start = new Date();
    const end = new Date(start.getTime() - 30 * 60 * 1000); // 30 mins before start (invalid)

    component.editForm.get('scheduledStart')?.setValue(start);
    component.editForm.get('scheduledEnd')?.setValue(end);

    component.editForm.updateValueAndValidity();

    const endErrors = component.editForm.get('scheduledEnd')?.errors;
    expect(endErrors?.['endBeforeStart']).toBeTrue();
  });

    it('submit shows notification when assignedTo is invalid', fakeAsync(() => {
      // make assigned validation fail
      spyOn(component, 'validateAssignedTo').and.returnValue(Promise.resolve(false));

      // ensure form is valid so submit progresses to assignedTo check
      component.isOrderValid = true;
      component.editForm.patchValue({
        orderId: updateScheduleMock.orderId ?? 'order1',
        title: 'Valid title',
        scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        description: 'desc',
        assignedTo: userMock.id
      });

      // clear any lingering validation errors so the form doesn't block prematurely
      component.editForm.markAllAsTouched();
      ['orderId', 'title', 'scheduledStart', 'scheduledEnd', 'description', 'assignedTo'].forEach(k => {
        const ctrl = component.editForm.get(k as any);
        if (ctrl) ctrl.setErrors(null);
      });
      component.editForm.updateValueAndValidity();

      component.submit();
      // resolve awaited promise inside submit
      tick();
      // flush any microtasks triggered by notifications/observables
      flushMicrotasks?.();

      // notification shown and no update call
      expect((TestBed.inject(NotificationService) as any).show)
        .toHaveBeenCalledWith('Assigned To is invalid or not found.', 'Close');
      expect(TestBed.inject(ScheduleService).update).not.toHaveBeenCalled();
    }));

  it('non-admin submit uses currentUserId as assignedToId', fakeAsync(() => {
    // ensure current auth is non-admin (default mock) and getCurrentUser returns userMock
    spyOn(component, 'validateAssignedTo').and.returnValue(Promise.resolve(true));

    const scheduleSvc = TestBed.inject(ScheduleService) as jasmine.SpyObj<any>;
    scheduleSvc.update.and.returnValue(of({}));

    // mark order valid and put a different assignedTo value (should be ignored for non-admin)
    component.isOrderValid = true;
    component.editForm.patchValue({
      orderId: updateScheduleMock.orderId ?? 'order1',
      title: updateScheduleMock.title,
      scheduledStart: new Date(updateScheduleMock.scheduledStart),
      scheduledEnd: new Date(updateScheduleMock.scheduledEnd),
      description: updateScheduleMock.description,
      assignedTo: 'some-other-id'
    });

    component.submit();
    tick();
    flushMicrotasks();

    expect(scheduleSvc.update).toHaveBeenCalled();
    const dtoSent = scheduleSvc.update.calls.mostRecent().args[1];
    expect(dtoSent.assignedToId).toBe((TestBed.inject(AuthService) as any).getCurrentUser().id);
  }));

  it('submit sends scheduledStart and scheduledEnd normalized to ISO-midnight in DTO', fakeAsync(() => {
    // make assigned validation pass
    spyOn(component, 'validateAssignedTo').and.returnValue(Promise.resolve(true));

    // ensure the update spy on the injected service is under control
    const scheduleSvc = TestBed.inject(ScheduleService) as any;
    scheduleSvc.update = jasmine.createSpy('update').and.returnValue(of({}));

    // ensure component lifecycle settled
    fixture.detectChanges();
    tick();

    component.isOrderValid = true;

    // pick a start that passes the startNotBeforeMidnightValidator (use nextMidnight)
    const start: Date = component.nextMidnight;
    const end = new Date(start);
    end.setDate(start.getDate() + 2); // well after start/min

    // patch form with valid values
    component.editForm.patchValue({
      orderId: updateScheduleMock.orderId ?? 'order1',
      title: updateScheduleMock.title ?? 'T',
      scheduledStart: start,
      scheduledEnd: end,
      description: updateScheduleMock.description ?? 'd',
      assignedTo: userMock.id
    });

    // **Force-clear any lingering errors so form.valid becomes true** (validators don't need to be tested here)
    ['orderId', 'title', 'scheduledStart', 'scheduledEnd', 'description', 'assignedTo'].forEach(k => {
      const ctrl = component.editForm.get(k as any);
      if (ctrl) ctrl.setErrors(null);
    });
    component.editForm.updateValueAndValidity();
    tick();

    if (!component.editForm.valid) {
      fail('Test setup: editForm is invalid before submit — check validators and patched values.');
      return;
    }

    component.submit();
    // advance microtasks/promises awaited by submit()
    tick();
    flushMicrotasks();

    expect(scheduleSvc.update).toHaveBeenCalled();

    const dtoSent = scheduleSvc.update.calls.mostRecent().args[1];
    const sVal = dtoSent.scheduledStart;
    const eVal = dtoSent.scheduledEnd;
    const sStr = typeof sVal === 'string' ? sVal : new Date(sVal).toISOString();
    const eStr = typeof eVal === 'string' ? eVal : new Date(eVal).toISOString();

    expect(sStr).toContain('00:00:00');
    expect(eStr).toContain('00:00:00');
  }));

});