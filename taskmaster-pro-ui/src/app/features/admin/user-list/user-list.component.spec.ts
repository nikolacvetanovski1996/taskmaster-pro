import { LOCALE_ID  } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { UserListComponent } from './user-list.component';
import { AdminService } from '../services/admin.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { DialogService } from '../../../shared/services/dialog.service';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MaterialModule } from '../../../shared/modules/material.module';
import { ReactiveFormsModule } from '@angular/forms';
import { DEFAULT_PAGE_SIZE_OPTIONS , PAGE_SIZE_OPTIONS } from '../../../shared/config/pagination-config';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { pagedUsersMock, userMock } from '../../../shared/mock-data';

class AdminServiceMock {
  getPagedUsers = jasmine.createSpy().and.returnValue(
    of({ data: [], draw: 1, recordsTotal: 0 })
  );
  deleteUser = jasmine.createSpy().and.returnValue(of({}));
  changeUserRoles = jasmine.createSpy().and.returnValue(of({}));
}

class NotificationServiceMock {
  show = jasmine.createSpy();
}

class DialogServiceMock {
  confirm = jasmine.createSpy().and.returnValue(of(true));
   open = jasmine.createSpy().and.callFake((component: any, config: any) => {
    if (config.data.title === 'Confirm Delete') {
      return of(true);
    }
    return of(null);
  });
}

const expectedExport = [
  { id: '00000000-0000-0000-0000-000000000001', email: 'nikola@examle.com', fullName: 'Nikola Example', roles: 'Admin' },
  { id: '00000000-0000-0000-0000-000000000002', email: 'alice@example.com', fullName: 'Alice Example', roles: 'User' },
  { id: '00000000-0000-0000-0000-000000000003', email: 'bob@example.com', fullName: 'Bob Example', roles: 'User' }
];

describe('UserListComponent', () => {
  let component: UserListComponent;
  let fixture: ComponentFixture<UserListComponent>;
  let adminService: AdminServiceMock;
  let notification: NotificationServiceMock;
  let dialogService: DialogServiceMock;
  let router: jasmine.SpyObj<Router>;
  
  registerLocaleData(localeDe);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        UserListComponent,
        NoopAnimationsModule,
        MaterialModule,
        ReactiveFormsModule
      ],
      providers: [
        { provide: AdminService, useClass: AdminServiceMock },
        { provide: NotificationService, useClass: NotificationServiceMock },
        { provide: DialogService, useClass: DialogServiceMock },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: PAGE_SIZE_OPTIONS, useValue: DEFAULT_PAGE_SIZE_OPTIONS },
        { provide: LOCALE_ID, useValue: 'en-US' }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UserListComponent);
    component = fixture.componentInstance;
    adminService = TestBed.inject(AdminService) as unknown as AdminServiceMock;
    notification = TestBed.inject(NotificationService) as unknown as NotificationServiceMock;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    dialogService = TestBed.inject(DialogService) as unknown as DialogServiceMock;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load users on init', () => {
    expect(adminService.getPagedUsers).toHaveBeenCalled();
  });

  it('should navigate to user detail on viewUser', () => {
    component.viewUser('123');
    expect(router.navigate).toHaveBeenCalledWith(['/admin/users', '123']);
  });

  it('should update user roles successfully', () => {
    component.changeUserRoles('123', { roles: ['Admin'] });
    expect(adminService.changeUserRoles).toHaveBeenCalledWith('123', { roles: ['Admin'] });
    expect(notification.show).toHaveBeenCalledWith('User roles updated successfully.');
  });

  it('should handle error on updating roles', () => {
    adminService.changeUserRoles.and.returnValue(throwError(() => new Error('fail')));
    component.changeUserRoles('123', { roles: ['Admin'] });
    expect(notification.show).toHaveBeenCalledWith('Failed to update user roles.', 'Close');
  });

  it('should confirm and delete user when confirmed', fakeAsync(() => {
    // make delete succeed and getPagedUsers return empty page
    adminService.deleteUser.and.returnValue(of(void 0));
    adminService.getPagedUsers.and.returnValue(of({ data: [], draw: 1, recordsTotal: 0 }));

    (TestBed.inject(DialogService) as unknown as DialogServiceMock).open.and.returnValue(of(true));

    component.deleteUser('1');
    tick(); 

    expect(adminService.deleteUser).toHaveBeenCalledWith('1');
    expect(notification.show).toHaveBeenCalledWith('User deleted successfully.');
    expect(adminService.getPagedUsers).toHaveBeenCalled();
  }));

  it('should not delete if cancelled', fakeAsync(() => {
    dialogService.open.and.returnValue(of(false));

    // ensure deleteUser spy exists but not called
    adminService.deleteUser.and.returnValue(of(void 0));
    adminService.getPagedUsers.calls.reset();
    adminService.deleteUser.calls.reset();
    notification.show.calls.reset();

    component.deleteUser('1');
    tick();

    expect(adminService.deleteUser).not.toHaveBeenCalled();
    expect(notification.show).not.toHaveBeenCalledWith('User deleted successfully.');
    expect(adminService.getPagedUsers).not.toHaveBeenCalled();
  }));

  it('should handle error on delete', fakeAsync(() => {
    // delete fails
    adminService.deleteUser.and.returnValue(throwError(() => new Error('API error')));
    adminService.getPagedUsers.calls.reset();
    notification.show.calls.reset();

    component.deleteUser('1');
    tick();

    expect(adminService.deleteUser).toHaveBeenCalledWith('1');
    expect(notification.show).toHaveBeenCalledWith('Could not delete user.', 'Close');
    // on error the page shouldn't be reloaded
    expect(adminService.getPagedUsers).not.toHaveBeenCalled();
  }));

  it('should export users to Excel', fakeAsync(() => {
    const exportSpy = spyOn(component['exportService'], 'exportToExcel');

    adminService.getPagedUsers.and.returnValue(of(pagedUsersMock));

    component.exportUsersExcel();
    tick();

    expect(adminService.getPagedUsers).toHaveBeenCalled();
    expect(exportSpy).toHaveBeenCalledWith(
      expectedExport,
      'Users',
      component['headerMap']
    );
  }));

  it('should export users to CSV', fakeAsync(() => {
    const exportSpy = spyOn(component['exportService'], 'exportToCSV');

    adminService.getPagedUsers.and.returnValue(of(pagedUsersMock));

    component.exportUsersCSV();
    tick();

    expect(adminService.getPagedUsers).toHaveBeenCalled();
    expect(exportSpy).toHaveBeenCalledWith(
      expectedExport,
      'Users',
      component['headerMap']
    );
  }));

  it('should show notification if export fails', fakeAsync(() => {
    adminService.getPagedUsers.and.returnValue(throwError(() => new Error('API fail')));

    component.exportUsersExcel();
    tick();
    expect(notification.show).toHaveBeenCalledWith('Failed to export users.', 'Close');

    component.exportUsersCSV();
    tick();
    expect(notification.show).toHaveBeenCalledWith('Failed to export users.', 'Close');
  }));
});
