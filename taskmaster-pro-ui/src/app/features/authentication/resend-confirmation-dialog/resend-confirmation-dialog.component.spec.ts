import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ResendConfirmationDialogComponent } from './resend-confirmation-dialog.component';
import { RecaptchaModule } from 'ng-recaptcha';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ResendConfirmationDialogComponent', () => {
  let component: ResendConfirmationDialogComponent;
  let fixture: ComponentFixture<ResendConfirmationDialogComponent>;
  let dialogRefCloseSpy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ResendConfirmationDialogComponent,
        RecaptchaModule,
        MatDialogModule,
        MatInputModule,
        NoopAnimationsModule
    ],
      providers: [
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResendConfirmationDialogComponent);
    component = fixture.componentInstance;

    // Grab the spy from the injected provider
    const dialogRef = TestBed.inject(MatDialogRef);
    dialogRefCloseSpy = dialogRef.close as jasmine.Spy;

    fixture.detectChanges();
  });

  it('should create component', () => {
    expect(component).toBeTruthy();
  });

  it('should disable resend button initially', () => {
    const resendBtn = fixture.debugElement.query(By.css('button[color="warn"]')).nativeElement;
    expect(resendBtn.disabled).toBeTrue();
  });

  it('should enable resend button when captcha is resolved', () => {
    component.onCaptchaResolved('fake-token');
    fixture.detectChanges();

    const resendBtn = fixture.debugElement.query(By.css('button[color="warn"]')).nativeElement;
    expect(resendBtn.disabled).toBeFalse();
  });

  it('should show captcha error message when captcha expires', () => {
    component.onCaptchaExpired();
    fixture.detectChanges();

    const errorMsg = fixture.debugElement.query(By.css('mat-error')).nativeElement;
    expect(errorMsg.textContent).toContain('Please complete the CAPTCHA.');
  });

  it('should emit resend event and not close dialog on resend', () => {
    spyOn(component.resend, 'emit');

    component.captchaResolved = true;
    component.captchaToken = 'fake-token';

    component.onResend();

    expect(component.resend.emit).toHaveBeenCalledWith('fake-token');
    expect(dialogRefCloseSpy).not.toHaveBeenCalled();
  });

  it('should close dialog with false on cancel', () => {
    component.onCancel();
    expect(dialogRefCloseSpy).toHaveBeenCalledWith({ confirmed: false });
  });

  it('should start and run cooldown correctly', fakeAsync(() => {
    component.startCooldown(3);
    expect(component.isResendDisabled).toBeTrue();
    expect(component.resendCooldownSeconds).toBe(3);

    tick(1000);
    expect(component.resendCooldownSeconds).toBe(2);

    tick(2000);
    expect(component.resendCooldownSeconds).toBe(0);
    expect(component.isResendDisabled).toBeFalse();
  }));

  it('should reset captcha state and call recaptchaRef.reset()', () => {
    component.captchaToken = 'token';
    component.captchaResolved = true;
    component.captchaError = true;

    component.recaptchaRef = { reset: jasmine.createSpy('reset') } as any;

    component.resetCaptcha();

    expect(component.captchaToken).toBe('');
    expect(component.captchaResolved).toBeFalse();
    expect(component.captchaError).toBeFalse();
    expect(component.recaptchaRef!.reset).toHaveBeenCalled();
  });

  it('onResend without captcha token sets captchaError and does not emit or close', () => {
    spyOn(component.resend, 'emit');

    component.captchaToken = '';
    component.captchaResolved = false;
    component.captchaError = false;

    component.onResend();

    expect(component.captchaError).toBeTrue();
    expect(component.resend.emit).not.toHaveBeenCalled();
    expect(dialogRefCloseSpy).not.toHaveBeenCalled();
  });
});

describe('ResendConfirmationDialogComponent - cooldown data', () => {
  let component: ResendConfirmationDialogComponent;
  let fixture: ComponentFixture<ResendConfirmationDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ResendConfirmationDialogComponent,
        RecaptchaModule,
        MatDialogModule,
        MatInputModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: { isResendDisabled: true, resendCooldownSeconds: 5 } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResendConfirmationDialogComponent);
    component = fixture.componentInstance;
  });

  it('constructor starts cooldown if data has isResendDisabled and resendCooldownSeconds', () => {
    // Spy on the method before instantiation
    const startCooldownSpy = spyOn(
      ResendConfirmationDialogComponent.prototype,
      'startCooldown'
    ).and.callThrough();

    fixture = TestBed.createComponent(ResendConfirmationDialogComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();

    expect(component.isResendDisabled).toBeTrue();
    expect(component.resendCooldownSeconds).toBe(5);
    expect(startCooldownSpy).toHaveBeenCalledWith(5);
  });
});