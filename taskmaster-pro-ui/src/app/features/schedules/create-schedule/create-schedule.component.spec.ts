import { ComponentFixture, TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CreateScheduleComponent } from './create-schedule.component';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { ScheduleService } from '../../../core/services/schedule.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createScheduleMock, userMock } from '../../../shared/mock-data';
import { AuthService } from '../../authentication/services/auth.service';

class MockScheduleService {
  create = jasmine.createSpy().and.returnValue(of({}));
}

class MockNotificationService {
  show = jasmine.createSpy();
}

class MockOrderService {
  // used by autocomplete; return empty list by default
  searchOrders = jasmine.createSpy('searchOrders').and.returnValue(of([]));
  // used by validateOrderId / live validation: default to true so submit can proceed
  exists = jasmine.createSpy('exists').and.returnValue(of(true));
}

class MockAuthService {
  isAdmin$ = of(false); // default
  getCurrentUser() {
    // match the real service shape
    return { id: 'user-1', isAdmin: false };
  }
}

class MockRouter {
  navigate = jasmine.createSpy();
}

describe('CreateScheduleComponent', () => {
  let component: CreateScheduleComponent;
  let fixture: ComponentFixture<CreateScheduleComponent>;
  let scheduleService: MockScheduleService;
  let notification: MockNotificationService;
  let router: MockRouter;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        CreateScheduleComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: OrderService, useClass: MockOrderService },
        { provide: ScheduleService, useClass: MockScheduleService },
        { provide: NotificationService, useClass: MockNotificationService },
        { provide: AuthService, useClass: MockAuthService },
        { provide: Router, useClass: MockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({}) 
            },
            paramMap: of(convertToParamMap({})),
            queryParamMap: of(convertToParamMap({}))
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateScheduleComponent);
    component = fixture.componentInstance;
    scheduleService = TestBed.inject(ScheduleService) as unknown as MockScheduleService;
    notification = TestBed.inject(NotificationService) as unknown as MockNotificationService;
    router = TestBed.inject(Router) as unknown as MockRouter;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the form with default values', () => {
    expect(component.scheduleForm).toBeTruthy();
    expect(component.scheduleForm.get('title')?.value).toBe('');
    expect(component.scheduleForm.get('description')?.value).toBe('');
  });

  it('should disable assignedTo for non-admin users', () => {
    // ensure AuthService will emit non-admin before component initialization
    const auth = TestBed.inject(AuthService) as unknown as MockAuthService;
    auth.isAdmin$ = of(false);

    // recreate component so ngOnInit runs with the new auth value
    fixture = TestBed.createComponent(CreateScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.assignedTo.disabled).toBeTrue();
  });

  it('should enable assignedTo for admin users', () => {
    // ensure AuthService will emit admin before component initialization
    const auth = TestBed.inject(AuthService) as unknown as MockAuthService;
    auth.isAdmin$ = of(true);

    // recreate component so ngOnInit runs with the new auth value
    fixture = TestBed.createComponent(CreateScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.assignedTo.enabled).toBeTrue();
  });
  
  it('should not submit if form is invalid', () => {
    component.scheduleForm.patchValue({ orderId: '' }); // missing required fields
    component.submit();
    expect(scheduleService.create).not.toHaveBeenCalled();
  });

    it('should call scheduleService.create and navigate on success', fakeAsync(() => {
    // ensure the assignment validation resolves true so submit proceeds
      spyOn(component, 'validateAssignedTo').and.returnValue(Promise.resolve(true));

      // fill required fields from mock (ensure assignedTo exists in the form)
      component.scheduleForm.patchValue({
        ...createScheduleMock,
        assignedTo: createScheduleMock.assignedToId ?? null
      });

      component.isOrderValid = true;

      component.submit();
      // resolve awaited promise inside submit()
      tick();
      // flush any microtasks triggered by subscribe callbacks
      flushMicrotasks?.();

      expect(scheduleService.create).toHaveBeenCalled();
      expect(notification.show).toHaveBeenCalledWith('Schedule created!');
      expect(router.navigate).toHaveBeenCalledWith(['/schedules']);
    }));


    it('should handle error on schedule creation', fakeAsync(() => {
      // Force the service to throw an error
      scheduleService.create.and.returnValue(throwError(() => new Error('Error')));
      // stub validation so submit reaches the create() call
      spyOn(component, 'validateAssignedTo').and.returnValue(Promise.resolve(true));

      // fill required fields from mock (include assignedTo)
      component.scheduleForm.patchValue({
        ...createScheduleMock,
        assignedTo: createScheduleMock.assignedToId ?? null
      });

      component.isOrderValid = true;
      component.submit();
      tick();
      flushMicrotasks?.();

      expect(notification.show).toHaveBeenCalledWith('Failed to create schedule', 'Close');
      expect(component.isSubmitting).toBeFalse();
    }));

  it('should navigate back on cancel', () => {
    component.cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/schedules']);
  });

  it('should call orderService.exists when validating order id', () => {
    const orderSvc = TestBed.inject(OrderService) as unknown as jasmine.SpyObj<any>;
    orderSvc.exists.and.returnValue(of(true));

    component.validateOrderId('abc-123');

    expect(orderSvc.exists).toHaveBeenCalledWith('abc-123');
  });

  it('should call searchOrders when typing >= searchMinLength chars (debounced)', fakeAsync(() => {
    const orderSvc = TestBed.inject(OrderService) as unknown as jasmine.SpyObj<any>;
    orderSvc.searchOrders.and.returnValue(of([]));

    // Ensure the pipeline is subscribed like the template's async pipe would be
    const sub = component.orderSuggestions$.subscribe();

    // Use a value that meets the component's min length (component.searchMinLength)
    const min = component.searchMinLength;
    const query = 'x'.repeat(min); // e.g. 'xxxx' if min === 3

    component.orderId.setValue(query);
    tick(300); // debounceTime(300)
    fixture.detectChanges();

    expect(orderSvc.searchOrders).toHaveBeenCalledWith(query);

    sub.unsubscribe();
  }));

  it('should paste from clipboard and validate', fakeAsync(async () => {
    const orderSvc = TestBed.inject(OrderService) as unknown as jasmine.SpyObj<any>;
    orderSvc.exists.and.returnValue(of(true));

    // Spy on navigator.clipboard.readText
    const readTextSpy = spyOn(navigator.clipboard, 'readText')
      .and.returnValue(Promise.resolve('pasted-id'));

    await component.pasteFromClipboard();
    tick();

    expect(component.orderId.value).toBe('pasted-id');
    expect(orderSvc.exists).toHaveBeenCalledWith('pasted-id');
    expect(readTextSpy).toHaveBeenCalled();
  }));

  it('should unsubscribe on destroy', () => {
    const destroySpy = jasmine.createSpyObj('destroy$', ['next', 'complete']);
    // replace the private destroy$ subject with the spy object
    (component as any).destroy$ = destroySpy;

    component.ngOnDestroy();

    expect(destroySpy.next).toHaveBeenCalled();
    expect(destroySpy.complete).toHaveBeenCalled();
  });

  it('should set endBeforeStart form error when end < start', () => {
    const start = new Date('2040-09-10T10:00:00Z');
    const end = new Date('2040-09-09T10:00:00Z');
    component.scheduleForm.patchValue({ scheduledStart: start, scheduledEnd: end });

    // error is applied to the scheduledEnd control
    expect(component.scheduleForm.get('scheduledEnd')!.hasError('endBeforeStart')).toBeTrue();
  });

  it('should set beforeMidnight error if start is before next midnight', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    component.scheduleForm.get('scheduledStart')!.setValue(yesterday);
    
    const errors = component.scheduleForm.get('scheduledStart')!.errors;
    expect(errors?.['beforeMidnight']).toBeTrue();
  });

  it('should not set error if start is after next midnight', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    component.scheduleForm.get('scheduledStart')!.setValue(tomorrow);
    
    const errors = component.scheduleForm.get('scheduledStart')!.errors;
    expect(errors).toBeNull();
  });

  it('should set endBeforeMidnight error if end is before next midnight', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    component.scheduleForm.get('scheduledEnd')!.setValue(yesterday);

    const errors = component.scheduleForm.get('scheduledEnd')!.errors;
    expect(errors?.['endBeforeStart']).toBeTrue();
  });

  it('should not set error if end is after next midnight', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    component.scheduleForm.get('scheduledEnd')!.setValue(tomorrow);

    const errors = component.scheduleForm.get('scheduledEnd')!.errors;
    expect(errors).toBeNull();
  });

    it('should call scheduleService.create with assignedToId when assignedTo is object', fakeAsync(() => {
      const scheduleSvc = TestBed.inject(ScheduleService) as any;
      scheduleSvc.create.and.returnValue(of({}));

      // ensure admin mode and that assignedTo control contains the user object
      component.isAdmin = true;
      if (component.assignedTo.disabled) {
        component.assignedTo.enable({ emitEvent: false });
      }
      component.assignedTo.setValue(userMock);

      // stub validateAssignedTo to resolve true for the object's id (component.submit will still call validateAssignedTo but external async flakiness needs to be avoided)
      spyOn(component, 'validateAssignedTo').and.returnValue(Promise.resolve(true));

      // fill other required fields from mock
      component.scheduleForm.patchValue(createScheduleMock);

      component.isOrderValid = true;
      component.submit();
      tick();
      flushMicrotasks?.();

      expect(scheduleSvc.create).toHaveBeenCalled();
      const dto = scheduleSvc.create.calls.mostRecent().args[0];
      expect(dto.assignedToId).toBe(userMock.id);
    }));
});
