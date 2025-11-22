import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, throwError } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../../shared/modules/material.module';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { SecurityQuestionService } from '../../services/security-question.service'
import { RecaptchaModule, RecaptchaComponent } from 'ng-recaptcha';
import { SecurityQuestionRequestDto } from '../../models/security-question-request.dto';
import { VerifySecurityAnswerDto } from '../../models/verify-security-answer.dto';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ResendConfirmationDto } from '../../models/resend-confirmation.dto';
import { ResendConfirmationDialogComponent } from '../../resend-confirmation-dialog/resend-confirmation-dialog.component';
import { ResendDialogData } from '../../models/resend-dialog-data';

@Component({
  selector: 'app-security-question-answer',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
    MatDialogModule,
    RecaptchaModule
  ],
  templateUrl: './answer.component.html',
  styleUrls: ['./answer.component.scss']
})
export class AnswerComponent implements OnInit, OnDestroy {
  answerForm!: FormGroup;
  loading = false;

  // Token + flags (not bound to form control)
  recaptchaToken = '';
  captchaResolved = false;
  recaptchaError = false;

  // State from route/service
  emailToUse = '';
  securityQuestion = '';
  sessionToken: string = '';

  // Resend confirmation state
  isResendDisabled = false;
  resendCooldownSeconds = 0;
  private resendInterval?: ReturnType<typeof setInterval>;

  @ViewChild('captchaRef') captchaRef?: RecaptchaComponent;

  private destroyed = false;
  private subs = new Subscription();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private securityQuestionService: SecurityQuestionService,
    private notification: NotificationService,
    private router: Router,
    private route: ActivatedRoute,
    public dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.answerForm = this.fb.group({
      securityAnswer: ['', [Validators.required, Validators.minLength(3)]]
    });

    // Grab from query params
    const qEmail = this.route.snapshot.queryParamMap.get('email') ?? '';
    const qQuestion = this.route.snapshot.queryParamMap.get('question') ?? '';
    const qSession = this.route.snapshot.queryParamMap.get('sessionToken') ?? '';

    // Grab from service (synchronously, if available)
    const svcEmail = this.securityQuestionService.getUserEmail?.() ?? '';

    // Use email from query param or service
    this.emailToUse = (qEmail || svcEmail).trim();

    // Session token from query param or blank
    this.sessionToken = qSession;

    if (!this.emailToUse) {
      console.warn('Missing email. Redirecting to start.');
      this.router.navigate(['/security-question/start']);
      return;
    }

    if (qQuestion) {
      this.securityQuestion = qQuestion.trim();
    } else {
      const dto: SecurityQuestionRequestDto = {
        email: this.emailToUse,
        recaptchaToken: ''
      };

      this.subs.add(
        this.securityQuestionService.getSecurityQuestion(dto).subscribe({
          next: (res) => {
            if (res && res.securityQuestion) {
              this.securityQuestion = res.securityQuestion.trim();
            } else {
              console.warn('No security question returned. Redirecting to start.');
              this.router.navigate(['/security-question/start']);
            }
          },
          error: (err) => {
            console.error('Failed to load security question:', err);
            this.router.navigate(['/security-question/start']);
          }
        })
      );
    }

    // Reset captcha flags
    this.recaptchaToken = '';
    this.captchaResolved = false;
    this.recaptchaError = false;
  }


  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.destroyed = true;
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
      this.resendInterval = undefined;
    }
  }

  onCaptchaResolved(token: string | null): void {
    this.recaptchaToken = token || '';
    this.captchaResolved = !!token;
    this.recaptchaError = false;
  }

  onCaptchaExpired(): void {
    this.recaptchaToken = '';
    this.captchaResolved = false;
    this.recaptchaError = true;
  }

  submitAnswer(): void {
    if (this.answerForm.invalid) return;

    if (!this.recaptchaToken) {
      this.recaptchaError = true;
      return;
    }

    const dto: VerifySecurityAnswerDto = {
      email: this.emailToUse,
      securityAnswer: this.answerForm.value.securityAnswer,
      recaptchaToken: this.recaptchaToken,
      sessionToken: this.sessionToken
    };

    this.setLoading(true);

    this.subs.add(
      this.securityQuestionService.verifySecurityAnswer(dto)
        .pipe(finalize(() => this.setLoading(false)))
        .subscribe({
          next: (res: any) => {
            const token = res?.token || res?.Token;
            const email = res?.email || res?.Email || this.emailToUse;

            if (!token) {
              this.notification.show('Unexpected response from server.', 'Close');
              this.clearCaptchaLocal();
              return;
            }

            this.router.navigate(['/reset-password'], { queryParams: { token, email } });
            this.clearCaptchaLocal();
          },
          error: (error: any) => {
            // Check for EmailNotConfirmed sentinel (403)
            if (error?.status === 403 && error?.error?.code === 'EmailNotConfirmed') {
              this.handleEmailNotConfirmed(this.emailToUse);
              this.clearCaptchaLocal();
              this.tryWidgetReset();
              return;
            }

            let backendMessage = '';

            if (typeof error?.error === 'string' && error.error.trim()) {
              backendMessage = error.error;
            } else if (error?.error?.errors && Array.isArray(error.error.errors) && error.error.errors.length > 0) {
              backendMessage = error.error.errors[0];
            } else if (error?.error?.error) {
              backendMessage = error.error.error;
            } else if (error?.error?.message) {
              backendMessage = error.error.message;
            } else {
              backendMessage = 'An unknown error occurred';
            }
                
            if (error?.status === 400) {
              this.notification.show(backendMessage || 'Invalid input or CAPTCHA failed.', 'Close');
            } else if (error?.status === 401) {
              this.notification.show(backendMessage || 'Incorrect security answer.', 'Close');
            } else if (error?.status === 429) {
              this.notification.show(backendMessage || 'Too many failed attempts. Try again later.', 'Close');
            } else {
              this.notification.show(backendMessage || 'Failed to verify security answer.', 'Close');
            }

            this.clearCaptchaLocal();
            this.tryWidgetReset();
          }
        })
    );
  }

  handleEmailNotConfirmed(email: string) {
    const data: ResendDialogData = 
    {
      isResendDisabled: this.isResendDisabled,
      resendCooldownSeconds: this.resendCooldownSeconds
    };

    const dialogRef  = this.dialog.open(ResendConfirmationDialogComponent, {
      width: '420px',
      data: data
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (!result?.confirmed) {
        return;
      }
    });

    const s = dialogRef.componentInstance.resend.subscribe((captchaToken: string) => {
      const dto: ResendConfirmationDto = {
        email: email,
        recaptchaToken: captchaToken
      };

      dialogRef.componentInstance.isLoading = true;
      dialogRef.disableClose = true;

      const apiSub = this.resendConfirmationLink(dto).subscribe({
        next: () => {
          this.startResendCooldown();
          this.notification.show('If the email is registered and unconfirmed, a confirmation link has been sent.');
          dialogRef.close({ confirmed: true });
        },
         error: (err) => {
          if (err?.status === 429) {
            this.notification.show(err?.error?.error ?? 'Too many requests. Try again later.', 'Close');

            const cooldown = 30;

            // START THE DIALOG’S COOLDOWN
            dialogRef.componentInstance.startCooldown(cooldown);

            dialogRef.componentInstance.isLoading = false;
            dialogRef.disableClose = false;

            dialogRef.componentInstance.resetCaptcha();
            return;
          } else if (err?.status === 400 && err?.error?.error) {
            this.notification.show(err.error.error, 'Close');
          } else {
            this.notification.show('Failed to send confirmation link. Try again later.', 'Close');
          }

          dialogRef.componentInstance.isLoading = false;
          dialogRef.disableClose = false;

          dialogRef.componentInstance.resetCaptcha();
        }
      });
      this.subs.add(apiSub);
    })
    this.subs.add(s);
  }

  resendConfirmationLink(dto: ResendConfirmationDto) {
    if (!dto.recaptchaToken) {
      return throwError(() => new Error('CAPTCHA token missing'));
    }

    return this.authService.resendConfirmationLink(dto);
  }

  startResendCooldown() {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }

    // Defensive: ensure there is a positive counter
    if (!this.resendCooldownSeconds || this.resendCooldownSeconds <= 0) {
      this.resendCooldownSeconds = 30;
    }

    this.resendInterval = setInterval(() => {
      this.resendCooldownSeconds--;
      if (this.resendCooldownSeconds <= 0) {
        if (this.resendInterval) {
          clearInterval(this.resendInterval);
          this.resendInterval = undefined;
        }
        this.isResendDisabled = false;
        this.resendCooldownSeconds = 0;
      }
    }, 1000);
  }

  goBack(): void {
    this.router.navigate(['/security-question/start'], { queryParams: { email: this.emailToUse } });
  }

  private clearCaptchaLocal(): void {
    this.recaptchaToken = '';
    this.captchaResolved = false;
    this.recaptchaError = false;
  }

  private setLoading(isLoading: boolean) {
    this.loading = isLoading;
  }

  private isGrecaptchaAvailable(): boolean {
    return !!(window as any)?.grecaptcha && typeof (window as any).grecaptcha.render === 'function';
  }

  private tryWidgetReset(): void {
    if (this.destroyed) return;
    if (!this.isGrecaptchaAvailable()) return;

    try {
      this.captchaRef?.reset();
    } catch (error) {
      console.error('Failed to reset reCAPTCHA widget:', error);
    }
  }

  get securityAnswer(): FormControl {
    return this.answerForm.get('securityAnswer')! as FormControl;
  }
}
