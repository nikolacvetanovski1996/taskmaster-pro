import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { EventEmitter } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { ReactiveFormsModule } from '@angular/forms';
import { AnswerComponent } from './answer.component';
import { AuthService } from '../../services/auth.service';
import { VerifySecurityAnswerDto } from '../../models/verify-security-answer.dto';
import { SecurityQuestionService } from '../../services/security-question.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ResendConfirmationDialogComponent } from '../../resend-confirmation-dialog/resend-confirmation-dialog.component';

class MockSecurityQuestionService {
  getUserEmail = jasmine.createSpy().and.returnValue('test@example.com');
  getSecurityQuestion = jasmine.createSpy().and.returnValue(of({ securityQuestion: 'Test question?' }));
  verifySecurityAnswer = jasmine.createSpy().and.returnValue(of({ token: 'abc123', email: 'test@example.com' }));
}

class MockNotificationService {
  show = jasmine.createSpy();
}

class MockRouter {
  navigate = jasmine.createSpy();
}

class MockAuthService {
  resendConfirmationLink = jasmine.createSpy().and.returnValue(of(void 0));
}

const mockActivatedRoute = {
  snapshot: {
    queryParamMap: {
      get: (key: string) => null
    }
  }
};

const verifySecurityAnswerMock: VerifySecurityAnswerDto = {
  email: 'test@example.com',
  securityAnswer: 'MyAnswer',
  recaptchaToken: 'valid-token',
  sessionToken: 'session123'
};

describe('AnswerComponent', () => {
  let component: AnswerComponent;
  let fixture: ComponentFixture<AnswerComponent>;
  let service: MockSecurityQuestionService;
  let notification: MockNotificationService;
  let router: MockRouter;
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

    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        ReactiveFormsModule,
        RouterTestingModule,
        AnswerComponent
      ],
      providers: [
        { provide: SecurityQuestionService, useClass: MockSecurityQuestionService },
        { provide: NotificationService, useClass: MockNotificationService },
        { provide: AuthService, useClass: MockAuthService },
        { provide: Router, useClass: MockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: MatDialog, useValue: matDialogSpy },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AnswerComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(SecurityQuestionService) as unknown as MockSecurityQuestionService;
    notification = TestBed.inject(NotificationService) as unknown as MockNotificationService;
    router = TestBed.inject(Router) as unknown as MockRouter;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not submit if form is invalid', () => {
    component.answerForm.setValue({ securityAnswer: '' });
    component.recaptchaToken = 'valid-token';
    component.submitAnswer();
    expect(service.verifySecurityAnswer).not.toHaveBeenCalled();
  });

  it('should set recaptchaError if no recaptcha token', () => {
    component.answerForm.setValue({ securityAnswer: 'MyAnswer' });
    component.recaptchaToken = '';
    component.submitAnswer();
    expect(component.recaptchaError).toBeTrue();
    expect(service.verifySecurityAnswer).not.toHaveBeenCalled();
  });

  it('should call verifySecurityAnswer with correct dto', () => {
    component.answerForm.setValue({ securityAnswer: 'MyAnswer' });
    component.recaptchaToken = 'valid-token';
    component.emailToUse = 'test@example.com';
    component.sessionToken = 'session123';

    component.submitAnswer();

    expect(service.verifySecurityAnswer).toHaveBeenCalledWith(verifySecurityAnswerMock);
  });

  it('should navigate to reset-password on success', () => {
    component.answerForm.setValue({ securityAnswer: 'MyAnswer' });
    component.recaptchaToken = 'valid-token';

    component.submitAnswer();

    expect(router.navigate).toHaveBeenCalledWith(['/reset-password'], { queryParams: { token: 'abc123', email: 'test@example.com' } });
  });

  it('should show error notification on error', fakeAsync(() => {
    service.verifySecurityAnswer.and.returnValue(throwError(() => ({ status: 401, error: 'Incorrect answer' })));

    component.answerForm.setValue({ securityAnswer: 'WrongAnswer' });
    component.recaptchaToken = 'valid-token';

    component.submitAnswer();
    tick();

    expect(notification.show).toHaveBeenCalledWith('Incorrect answer', 'Close');
  }));

  it('should go back to start', () => {
    component.emailToUse = 'test@example.com';
    component.goBack();
    expect(router.navigate).toHaveBeenCalledWith(['/security-question/start'], { queryParams: { email: 'test@example.com' } });
  });

  it('opens confirm dialog on EmailNotConfirmed and resends when confirmed', fakeAsync(() => {
    service.verifySecurityAnswer.and.returnValue(throwError(() => ({
      status: 403,
      error: { code: 'EmailNotConfirmed', error: 'Email not confirmed' }
    })));

    const auth = TestBed.inject(AuthService) as unknown as MockAuthService;
    (auth.resendConfirmationLink as jasmine.Spy).and.returnValue(of(void 0));

    component.answerForm.setValue({ securityAnswer: 'MyAnswer' });
    component.recaptchaToken = 'valid-token';
    component.emailToUse = 'test@example.com';

    component.submitAnswer();
    tick();

    // Emit token to simulate user confirming resend
    resendEmitter.emit('valid-token');
    tick();

    expect(matDialogSpy.open).toHaveBeenCalledWith(ResendConfirmationDialogComponent, jasmine.any(Object));
    expect(auth.resendConfirmationLink).toHaveBeenCalledWith({
      email: 'test@example.com',
      recaptchaToken: 'valid-token'
    });
  }));

  it('should resend confirmation link when dialog returns true', fakeAsync(() => {
    service.verifySecurityAnswer.and.returnValue(throwError(() => ({
      status: 403,
      error: { code: 'EmailNotConfirmed', error: 'Email not confirmed' }
    })));

    const auth = TestBed.inject(AuthService) as unknown as MockAuthService;
    (auth.resendConfirmationLink as jasmine.Spy).and.returnValue(of(void 0));

    component.answerForm.setValue({ securityAnswer: 'MyAnswer' });
    component.recaptchaToken = 'valid-token';
    component.emailToUse = 'test@example.com';

    component.submitAnswer();
    tick();

    // Emit token from dialog resend EventEmitter
    resendEmitter.emit('valid-token');
    tick();

    expect(matDialogSpy.open).toHaveBeenCalled();
    expect(auth.resendConfirmationLink).toHaveBeenCalledWith({
      email: 'test@example.com',
      recaptchaToken: 'valid-token'
    });
  }));

  it('on 429 should start dialog cooldown, keep dialog open and reset captcha', fakeAsync(() => {
    service.verifySecurityAnswer.and.returnValue(throwError(() => ({
      status: 403,
      error: { code: 'EmailNotConfirmed', error: 'Email not confirmed' }
    })));

    const auth = TestBed.inject(AuthService) as any;
    auth.resendConfirmationLink = jasmine.createSpy().and.returnValue(throwError(() => ({
      status: 429,
      error: { error: 'Too many requests' }
    })));

    matDialogSpy.open.and.returnValue(mockDialogRef);

    component.answerForm.setValue({ securityAnswer: 'MyAnswer' });
    component.recaptchaToken = 'valid-token';
    component.emailToUse = 'a@b.com';

    component.submitAnswer();
    tick();

    resendEmitter.emit('valid-token');
    tick();

    expect(matDialogSpy.open).toHaveBeenCalled();
    expect(auth.resendConfirmationLink).toHaveBeenCalledWith({ email: 'a@b.com', recaptchaToken: 'valid-token' });
    expect(mockDialogRef.componentInstance.startCooldown).toHaveBeenCalledWith(30);
    expect(mockDialogRef.componentInstance.resetCaptcha).toHaveBeenCalled();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  }));

  it('on successful resend dialog closes and starts parent cooldown', fakeAsync(() => {
    const auth = TestBed.inject(AuthService) as any;
    auth.resendConfirmationLink = jasmine.createSpy().and.returnValue(of(void 0));
    spyOn(component, 'startResendCooldown');

    component.emailToUse = 'a@b.com';

    component.handleEmailNotConfirmed('a@b.com');

    resendEmitter.emit('valid-token');
    tick();

    expect(auth.resendConfirmationLink).toHaveBeenCalled();
    expect(component.startResendCooldown).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith({ confirmed: true });
  }));
});
