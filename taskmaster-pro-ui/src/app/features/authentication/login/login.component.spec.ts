import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { EventEmitter } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ResendConfirmationDialogComponent } from '../resend-confirmation-dialog/resend-confirmation-dialog.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authSpy: jasmine.SpyObj<AuthService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let router: Router;
  let resendEmitter: EventEmitter<string>;
  let matDialogSpy: jasmine.SpyObj<MatDialog>;
  let mockDialogRef: MatDialogRef<any>;

  beforeEach(async () => {
    resendEmitter = new EventEmitter<string>();

    mockDialogRef = {
      afterClosed: () => of({ confirmed: true, captchaToken: 'valid-token' }),
      componentInstance: {
        isLoading: false,
        startCooldown: jasmine.createSpy('startCooldown'),
        resetCaptcha: jasmine.createSpy('resetCaptcha'),
        resend: resendEmitter,
        close: jasmine.createSpy('close'),
      },
      disableClose: false,
      close: jasmine.createSpy('close')
    } as unknown as MatDialogRef<any>;

    matDialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    matDialogSpy.open.and.returnValue(mockDialogRef);

    TestBed.overrideProvider(MatDialog, { useValue: matDialogSpy });

    authSpy = jasmine.createSpyObj('AuthService', ['login', 'resendConfirmationLink']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['show']);

    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        RouterTestingModule.withRoutes([]),
        LoginComponent
      ],
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: MatDialog, useValue: matDialogSpy },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the loginForm with controls', () => {
    expect(component.loginForm.contains('email')).toBeTrue();
    expect(component.loginForm.contains('password')).toBeTrue();
  });

  it('should not submit if form is invalid', () => {
    component.loginForm.setValue({ email: '', password: '' });
    component.submit();
    expect(authSpy.login).not.toHaveBeenCalled();
  });

  it('should submit valid form and navigate on success', fakeAsync(() => {
    component.loginForm.setValue({ email: 'test@test.com', password: '12345678' });
    authSpy.login.and.returnValue(of({ token: 'abc' } as any));

    component.submit();
    tick();

    expect(authSpy.login).toHaveBeenCalledWith({ email: 'test@test.com', password: '12345678' });
    expect(notifySpy.show).toHaveBeenCalledWith('Login successful!');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  }));

  it('should call handleEmailNotConfirmed when login throws EmailNotConfirmed', fakeAsync(() => {
    component.loginForm.setValue({ email: 'test@test.com', password: '12345678' });
    authSpy.login.and.returnValue(throwError(() => ({
      status: 403,
      error: {
        code: 'EmailNotConfirmed',
        error: "Your email isn't confirmed yet. Check your inbox."
      }
    })));

    spyOn(component, 'handleEmailNotConfirmed');

    component.submit();
    tick();

    expect(component.handleEmailNotConfirmed).toHaveBeenCalledWith('test@test.com');
  }));

  it('should show invalid credentials on generic error', fakeAsync(() => {
    component.loginForm.setValue({ email: 'test@test.com', password: '12345678' });
    authSpy.login.and.returnValue(throwError(() => new Error('OtherError')));

    component.submit();
    tick();

    expect(notifySpy.show).toHaveBeenCalledWith('Invalid credentials', 'Close');
  }));

  it('opens confirm dialog on EmailNotConfirmed and resends when confirmed', fakeAsync(() => {
    authSpy.login.and.returnValue(throwError(() => ({
      status: 403,
      error: { code: 'EmailNotConfirmed', error: 'Email not confirmed' }
    })));

    resendEmitter = new EventEmitter<string>();

    mockDialogRef = {
      afterClosed: () => of({ confirmed: true, captchaToken: 'valid-token' }),
      componentInstance: {
        isLoading: false,
        startCooldown: jasmine.createSpy('startCooldown'),
        resetCaptcha: jasmine.createSpy('resetCaptcha'),
        resend: resendEmitter,
        close: jasmine.createSpy('close'),
      },
      disableClose: false,
      close: jasmine.createSpy('close')
    } as unknown as MatDialogRef<any>;

    (matDialogSpy.open as jasmine.Spy).and.returnValue(mockDialogRef);
    authSpy.resendConfirmationLink.and.returnValue(of(void 0));

    component.loginForm.setValue({ email: 'a@b.com', password: '12345678' });
    component.submit();
    tick();

    resendEmitter.emit('valid-token');
    tick();

    expect(matDialogSpy.open).toHaveBeenCalledWith(ResendConfirmationDialogComponent, jasmine.any(Object));
    expect(authSpy.resendConfirmationLink).toHaveBeenCalledWith({
      email: 'a@b.com',
      recaptchaToken: 'valid-token'
    });
  }));

  it('should resend confirmation link when dialog returns true', fakeAsync(() => {
    authSpy.login.and.returnValue(throwError(() => ({
      status: 403,
      error: { code: 'EmailNotConfirmed', error: 'Email not confirmed' }
    })));

    resendEmitter = new EventEmitter<string>();

    mockDialogRef = {
      afterClosed: () => of({ confirmed: true, captchaToken: 'valid-token' }),
      componentInstance: {
        isLoading: false,
        startCooldown: jasmine.createSpy('startCooldown'),
        resetCaptcha: jasmine.createSpy('resetCaptcha'),
        resend: resendEmitter,
        close: jasmine.createSpy('close'),
      },
      disableClose: false,
      close: jasmine.createSpy('close')
    } as unknown as MatDialogRef<any>;

    (matDialogSpy.open as jasmine.Spy).and.returnValue(mockDialogRef);

    const resendSpy = spyOn(component, 'resendConfirmationLink').and.returnValue(of(void 0) as any);

    component.loginForm.setValue({ email: 'resend@test.com', password: '12345678' });
    component.submit();
    tick();

    resendEmitter.emit('valid-token');
    tick();

    expect(matDialogSpy.open).toHaveBeenCalled();
    expect(resendSpy).toHaveBeenCalledWith({
      email: 'resend@test.com',
      recaptchaToken: 'valid-token'
    });
  }));

  it('on 429 should start dialog cooldown, keep dialog open and reset captcha', fakeAsync(() => {
    authSpy.login.and.returnValue(throwError(() => ({
      status: 403,
      error: { code: 'EmailNotConfirmed', error: 'Email not confirmed' }
    })));

    resendEmitter = new EventEmitter<string>();

    mockDialogRef = {
      afterClosed: () => of({ confirmed: true, captchaToken: 'token' }),
      componentInstance: {
        isLoading: false,
        startCooldown: jasmine.createSpy('startCooldown'),
        resetCaptcha: jasmine.createSpy('resetCaptcha'),
        resend: resendEmitter,
        close: jasmine.createSpy('close'),
        captchaToken: ''
      },
      disableClose: false,
      close: jasmine.createSpy('close')
    } as unknown as MatDialogRef<any>;

    (matDialogSpy.open as jasmine.Spy).and.returnValue(mockDialogRef);

    authSpy.resendConfirmationLink = jasmine.createSpy().and.returnValue(throwError(() => ({
      status: 429,
      error: { error: 'Too many requests' }
    })));

    component.loginForm.setValue({ email: 'a@b.com', password: '12345678' });
    component.submit();
    tick();

    resendEmitter.emit('token');
    tick();

    expect(matDialogSpy.open).toHaveBeenCalled();
    expect(authSpy.resendConfirmationLink).toHaveBeenCalledWith({ email: 'a@b.com', recaptchaToken: 'token' });
    expect(mockDialogRef.componentInstance.startCooldown).toHaveBeenCalledWith(30);
    expect(mockDialogRef.componentInstance.resetCaptcha).toHaveBeenCalled();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  }));

  it('dialog onResend emits and sets loading', () => {
    const dlgFixture = TestBed.createComponent(ResendConfirmationDialogComponent);
    const dlg = dlgFixture.componentInstance;
    spyOn(dlg.resend, 'emit');

    dlg.captchaToken = 'valid-token';
    dlg.onResend();

    expect(dlg.isLoading).toBeTrue();
    expect(dlg.resend.emit).toHaveBeenCalledWith('valid-token');
  });

  it('on successful resend dialog closes and starts parent cooldown', fakeAsync(() => {
    resendEmitter = new EventEmitter<string>();

    mockDialogRef = {
      afterClosed: () => of({ confirmed: true, captchaToken: 'valid-token' }),
      componentInstance: {
        isLoading: true,
        startCooldown: jasmine.createSpy('startCooldown'),
        resetCaptcha: jasmine.createSpy('resetCaptcha'),
        resend: resendEmitter,
        close: jasmine.createSpy('close'),
        disableClose: true
      },
      disableClose: true,
      close: jasmine.createSpy('close')
    } as unknown as MatDialogRef<any>;

    (matDialogSpy.open as jasmine.Spy).and.returnValue(mockDialogRef);

    authSpy.resendConfirmationLink = jasmine.createSpy().and.returnValue(of(void 0));
    spyOn(component, 'startResendCooldown');

    component.loginForm.setValue({ email: 'a@b.com', password: '12345678' });
    component.handleEmailNotConfirmed('a@b.com');

    resendEmitter.emit('valid-token');
    tick();

    expect(authSpy.resendConfirmationLink).toHaveBeenCalled();
    expect(component.startResendCooldown).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith({ confirmed: true });
  }));
});
