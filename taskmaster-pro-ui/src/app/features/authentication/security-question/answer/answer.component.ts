import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../../shared/modules/material.module';
import { NotificationService } from '../../../../shared/services/notification.service';
import { SecurityQuestionService } from '../../services/security-question.service'
import { RecaptchaModule, RecaptchaComponent } from 'ng-recaptcha';
import { SecurityQuestionRequestDto } from '../../models/security-question-request.dto';
import { VerifySecurityAnswerDto } from '../../models/verify-security-answer.dto';

@Component({
  selector: 'app-security-question-answer',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
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

  @ViewChild('captchaRef') captchaRef?: RecaptchaComponent;

  private destroyed = false;
  private subs = new Subscription();

  constructor(
    private fb: FormBuilder,
    private securityQuestionService: SecurityQuestionService,
    private notification: NotificationService,
    private router: Router,
    private route: ActivatedRoute
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
