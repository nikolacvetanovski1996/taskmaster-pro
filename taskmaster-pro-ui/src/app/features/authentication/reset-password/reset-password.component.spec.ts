import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ResetPasswordComponent } from './reset-password.component';
import { ResetPasswordDto } from '../models/reset-password.dto';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/modules/material.module';

class MockAuthService {
  resetPassword = jasmine.createSpy('resetPassword');
}

class MockNotificationService {
  show = jasmine.createSpy('show');
}

class MockRouter {
  navigate = jasmine.createSpy('navigate');
}

const resetPasswordMock: ResetPasswordDto = {
  email: 'test@test.com',
  token: 'test-token',
  password: 'Password1!',
  confirmPassword: 'Password1!'
};

const resetPasswordWrongMock: ResetPasswordDto = {
  email: 'test@test.com',
  token: 'test-token',
  password: 'Password1!',
  confirmPassword: 'Password2!'
};

const resetPasswordInvalidFormMock: ResetPasswordDto = {
  email: '',
  token: '',
  password: '',
  confirmPassword: ''
};

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let authService: MockAuthService;
  let notification: MockNotificationService;
  let router: MockRouter;

  beforeEach(async () => {
    authService = new MockAuthService();
    notification = new MockNotificationService();
    router = new MockRouter();

    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        FormsModule,
        CommonModule,
        MaterialModule,
        ResetPasswordComponent
      ],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: NotificationService, useValue: notification },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({ token: 'test-token', email: encodeURIComponent('test@test.com') })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with token and email from query params', () => {
    expect(component.resetForm.value.email).toBe('test@test.com');
    expect(component.resetForm.value.token).toBe('test-token');
  });

  it('should calculate password strength correctly', () => {
    expect(component.calculatePasswordStrength('')).toBe(0);
    expect(component.calculatePasswordStrength('weakpw')).toBeGreaterThan(0);
    expect(component.calculatePasswordStrength('Password1!')).toBe(100);
  });

  it('should show error and navigate to login if query params are missing', () => {
    const badRoute = TestBed.inject(ActivatedRoute);
    (badRoute as any).queryParams = of({});

    component.ngOnInit();

    expect(notification.show).toHaveBeenCalledWith('Invalid or expired reset link.');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should not submit invalid form', () => {
    component.resetForm.setValue(resetPasswordInvalidFormMock);

    component.onSubmit();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('should show error if passwords do not match', () => {
    component.resetForm.setValue(resetPasswordWrongMock);

    component.onSubmit();

    expect(notification.show).toHaveBeenCalledWith('Passwords do not match.');
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('should submit valid form and show success notification', fakeAsync(() => {
    component.resetForm.setValue(resetPasswordMock);

    authService.resetPassword.and.returnValue(of(void 0));

    component.onSubmit();
    tick();

    expect(authService.resetPassword).toHaveBeenCalledWith(resetPasswordMock);
    expect(notification.show).toHaveBeenCalledWith('Password reset successful.');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  }));

  it('should show error notification on reset failure', fakeAsync(() => {
    component.resetForm.setValue(resetPasswordMock);

    authService.resetPassword.and.returnValue(throwError(() => new Error('Fail')));

    component.onSubmit();
    tick();

    expect(notification.show).toHaveBeenCalledWith(
      'Failed to reset password. Link may be expired or invalid. Request a new password reset.',
      'Close'
    );
  }));

  it('should navigate to login on cancel', () => {
    component.cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should show guidance when reset link is invalid', fakeAsync(() => {
    authService.resetPassword.and.returnValue(throwError(() => new Error('InvalidToken')));

    component.resetForm.setValue({
      email: 'test@test.com',
      token: 'test-token',
      password: 'Password1!',
      confirmPassword: 'Password1!'
    });

    component.onSubmit();
    tick();

    expect(notification.show).toHaveBeenCalledWith(
      'Failed to reset password. Link may be expired or invalid. Request a new password reset.',
      'Close'
    );
  }));
});
