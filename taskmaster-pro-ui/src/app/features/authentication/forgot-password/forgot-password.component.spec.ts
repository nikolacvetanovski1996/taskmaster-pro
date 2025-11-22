import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ForgotPasswordComponent } from './forgot-password.component';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationService } from '../../../shared/services/notification.service';
import { AuthService } from '../services/auth.service';
import { of, throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/modules/material.module';
import { RecaptchaModule } from 'ng-recaptcha';

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
        ForgotPasswordComponent
      ],
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Router, useValue: routerSpy }
      ]
    })
    .overrideComponent(ForgotPasswordComponent, {
      set: {
        template: `<form>
        <!-- Override template with minimal version to isolate component from Recaptcha during tests -->
        </form>`
      }
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call forgotPassword on submit with valid form', fakeAsync(() => {
    component.forgotForm.get('email')!.setValue('test@example.com');
    component.recaptchaToken = 'token123';
    authSpy.forgotPassword.and.returnValue(of(void 0));

    component.onSubmit();
    tick();

    expect(authSpy.forgotPassword).toHaveBeenCalledWith({ email: 'test@example.com', recaptchaToken: 'token123' });
    expect(notifySpy.show).toHaveBeenCalledWith('If your email is registered and confirmed, you will receive a password reset link.');
  }));

  it('should show error notification if forgotPassword fails', fakeAsync(() => {
    component.forgotForm.get('email')!.setValue('fail@example.com');
    component.recaptchaToken = 'token123';
    authSpy.forgotPassword.and.returnValue(throwError(() => new Error('Error')));

    component.onSubmit();
    tick();

    expect(notifySpy.show).toHaveBeenCalledWith('Failed to send reset link.', 'Close');
  }));

  it('should patch recaptchaToken on captcha resolved', () => {
    component.onCaptchaResolved('token123');
    expect(component.recaptchaToken).toBe('token123');
  });

  it('should clear recaptchaToken on captcha null', () => {
    component.onCaptchaResolved(null);
    expect(component.recaptchaToken).toBe('');
  });

  it('should not submit if form invalid', fakeAsync(() => {
    component.forgotForm.get('email')!.setValue('');
    component.recaptchaToken = '';
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
