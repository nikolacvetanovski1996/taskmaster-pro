import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ListSchedulesComponent } from './list-schedules.component';
import { ExportService } from '../../../shared/services/export.service';
import { ScheduleService } from '../../../core/services/schedule.service';
import { AuthService } from '../../authentication/services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { DialogService } from '../../../shared/services/dialog.service';
import { DEFAULT_PAGE_SIZE_OPTIONS , PAGE_SIZE_OPTIONS } from '../../../shared/config/pagination-config';
import { pagedSchedulesMock, scheduleMock } from '../../../shared/mock-data';

// Mocks
class MockScheduleService {
  getPaged = jasmine.createSpy().and.returnValue(of({ data: [], recordsTotal: 0 }));
  delete = jasmine.createSpy().and.returnValue(of({}));
}

class MockNotificationService {
  show = jasmine.createSpy();
}

class MockDialogService {
  confirm = jasmine.createSpy().and.returnValue(of(true));
  open = jasmine.createSpy().and.returnValue(of({}));
}

class MockRouter {
  navigate = jasmine.createSpy();
}

class MockExportService {
  exportToExcel = jasmine.createSpy('exportToExcel');
  exportToCSV = jasmine.createSpy('exportToCSV');
}

class MockAuthService {
  currentUser$ = of({ id: '00000000-0000-0000-0000-000000000001', isAdmin: true });
  isAdmin$ = of(true);
  isLoggedIn$ = of(true);
  getCurrentUser() {
    return { id: '00000000-0000-0000-0000-000000000001', isAdmin: true };
  }
}

const mapSchedules = (data: any[]) => data.map(s => ({
  id: s.id,
  orderId: s.orderId,
  scheduledStart: s.scheduledStart,
  scheduledEnd: s.scheduledEnd,
  title: s.title,
  description: s.description,
  assignedTo: s.assignedTo?.displayName ?? s.assignedTo?.id ?? '',
  created: s.created,
  createdBy: s.createdBy,
  updated: s.updated ?? '',
  updatedBy: s.updatedBy ?? ''
}));

describe('ListSchedulesComponent', () => {
  let component: ListSchedulesComponent;
  let fixture: ComponentFixture<ListSchedulesComponent>;
  let scheduleService: MockScheduleService;
  let notification: MockNotificationService;
  let dialogService: MockDialogService;
  let router: MockRouter;
  let exportServiceSpy: MockExportService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListSchedulesComponent],
      providers: [
        { provide: ScheduleService, useClass: MockScheduleService },
        { provide: NotificationService, useClass: MockNotificationService },
        { provide: DialogService, useClass: MockDialogService },
        { provide: Router, useClass: MockRouter },
        { provide: PAGE_SIZE_OPTIONS, useValue: DEFAULT_PAGE_SIZE_OPTIONS },
        { provide: ExportService, useClass: MockExportService },
        { provide: AuthService, useClass: MockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ListSchedulesComponent);
    component = fixture.componentInstance;
    scheduleService = TestBed.inject(ScheduleService) as unknown as MockScheduleService;
    notification = TestBed.inject(NotificationService) as unknown as MockNotificationService;
    dialogService = TestBed.inject(DialogService) as unknown as MockDialogService;
    exportServiceSpy = TestBed.inject(ExportService) as unknown as MockExportService;
    router = TestBed.inject(Router) as unknown as MockRouter;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load schedules on init', () => {
    expect(scheduleService.getPaged).toHaveBeenCalled();
    expect(component.schedules).toEqual([]);
    expect(component.totalRecords).toBe(0);
  });

  it('should navigate to create schedule', () => {
    component.createSchedule();
    expect(router.navigate).toHaveBeenCalledWith(['/schedules/create']);
  });

  it('should navigate to edit schedule', () => {
    component.editSchedule('123');
    expect(router.navigate).toHaveBeenCalledWith(['/schedules/edit', '123']);
  });

  it('should delete schedule when confirmed', fakeAsync(() => {
    component.schedules = [scheduleMock];
    component.deleteSchedule(scheduleMock.id);
    tick(); 
    
    expect(dialogService.confirm).toHaveBeenCalled();
    expect(scheduleService.delete).toHaveBeenCalledWith(scheduleMock.id);
    expect(notification.show).toHaveBeenCalledWith('Schedule deleted successfully.');
  }));

  it('should not delete schedule when not confirmed', () => {
    dialogService.confirm.and.returnValue(of(false));
    component.deleteSchedule('123');
    expect(scheduleService.delete).not.toHaveBeenCalled();
  });

  it('should show error when delete fails', () => {
    scheduleService.delete.and.returnValue(throwError(() => new Error('fail')));
    component.deleteSchedule('123');
    expect(notification.show).toHaveBeenCalledWith('Could not find schedule to delete.', 'Close');
  });

  it('should export all schedules to Excel', fakeAsync(() => {
    component.totalRecords = pagedSchedulesMock.recordsTotal;
    (scheduleService.getPaged).and.returnValue(of(pagedSchedulesMock));

    component.exportSchedulesExcel();
    tick();

    expect(scheduleService.getPaged).toHaveBeenCalled();
    expect(exportServiceSpy.exportToExcel).toHaveBeenCalledWith(mapSchedules(pagedSchedulesMock.data), 'Schedules', component.headerMap);
  }));

  it('should export all schedules to CSV', fakeAsync(() => {
    component.totalRecords = pagedSchedulesMock.recordsTotal;
    (scheduleService.getPaged).and.returnValue(of(pagedSchedulesMock));

    component.exportSchedulesCSV();
    tick();

    expect(scheduleService.getPaged).toHaveBeenCalled();
    expect(exportServiceSpy.exportToCSV).toHaveBeenCalledWith(mapSchedules(pagedSchedulesMock.data), 'Schedules', component.headerMap);
  }));

  it('should show notification when no schedules to export', fakeAsync(() => {
    component.totalRecords = 0;
    component.exportSchedulesExcel();
    tick();
    expect(notification.show).toHaveBeenCalledWith('No schedules to export.', 'Close');
  }));
});
