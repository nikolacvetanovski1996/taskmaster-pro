import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ForgotPasswordComponent } from './forgot-password.component';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationService } from '../../../shared/services/notification.service';
import { AuthService } from '../services/auth.service';
import { of, throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/modules/material.module';
import { RecaptchaModule, RecaptchaFormsModule } from 'ng-recaptcha';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let authSpy: jasmine.SpyObj<AuthService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    authSpy = jasmine.createSpyObj('AuthService', ['forgotPassword']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['show']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        ReactiveFormsModule,
        MaterialModule,
        RecaptchaModule,
        RecaptchaFormsModule,
        ForgotPasswordComponent
      ],
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Router, useValue: routerSpy },
        FormBuilder
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call forgotPassword on submit with valid form', fakeAsync(() => {
    component.forgotForm.setValue({ email: 'test@example.com', recaptchaToken: 'token123' });
    authSpy.forgotPassword.and.returnValue(of(void 0));

    component.onSubmit();
    tick();

    expect(authSpy.forgotPassword).toHaveBeenCalledWith({ email: 'test@example.com', recaptchaToken: 'token123' });
    expect(notifySpy.show).toHaveBeenCalledWith('Reset link sent to your email.');
  }));

  it('should show error notification if forgotPassword fails', fakeAsync(() => {
    component.forgotForm.setValue({ email: 'fail@example.com', recaptchaToken: 'token123' });
    authSpy.forgotPassword.and.returnValue(throwError(() => new Error('Error')));

    component.onSubmit();
    tick();

    expect(notifySpy.show).toHaveBeenCalledWith('Failed to send reset link.', 'Close');
  }));

  it('should patch recaptchaToken on captcha resolved', () => {
    component.onCaptchaResolved('token123');
    expect(component.forgotForm.value.recaptchaToken).toBe('token123');
  });

  it('should clear recaptchaToken on captcha null', () => {
    component.onCaptchaResolved(null);
    expect(component.forgotForm.value.recaptchaToken).toBe('');
  });

  it('should not submit if form invalid', fakeAsync(() => {
    component.forgotForm.setValue({ email: '', recaptchaToken: '' });
    component.onSubmit();
    tick();
    expect(authSpy.forgotPassword).not.toHaveBeenCalled();
    expect(notifySpy.show).not.toHaveBeenCalled();
  }));

  it('should navigate to security question', () => {
    component.goToSecurityQuestion();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/security-question/start']);
  });

  it('should cancel to login', () => {
    component.cancel();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });
});
