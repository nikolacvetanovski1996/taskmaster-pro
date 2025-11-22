import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../../shared/modules/material.module';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RecaptchaModule, RecaptchaComponent } from 'ng-recaptcha';
import { SecurityQuestionRequestDto } from '../../models/security-question-request.dto';
import { SecurityQuestionService } from '../../services/security-question.service';

@Component({
  selector: 'app-security-question-start',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
    RecaptchaModule
  ],
  templateUrl: './start.component.html',
  styleUrls: ['./start.component.scss']
})
export class StartComponent implements OnInit, OnDestroy {
  emailForm!: FormGroup;
  loading = false;
  
  // Token + flags (not bound to form control)
  recaptchaToken = '';
  captchaResolved = false;
  recaptchaError = false;

  @ViewChild('captchaRef') captchaRef?: RecaptchaComponent;

  private destroyed = false;
  private subscriptions = new Subscription();
  
  constructor(
    private fb: FormBuilder,
    private securityQuestionService: SecurityQuestionService,
    private notification: NotificationService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.emailForm = this.fb.group({
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(254)
      ]]
    });

    const emailFromQuery = this.route.snapshot.queryParamMap.get('email') ?? '';
    const emailFromService = this.securityQuestionService.getUserEmail?.() ?? '';

    const emailToUse = (emailFromQuery || emailFromService || '').trim();

    if (emailToUse) {
      // Validate lightly: only patch if it looks like an email
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse)) {
        this.emailForm.patchValue({ email: emailToUse });
      } else {
        // Bad value in query/service - in that case ignore it
        console.warn('Ignored invalid email from route/service:', emailToUse);
      }
    }

    this.captchaResolved = false;
    this.recaptchaToken = '';
    this.recaptchaError = false;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.destroyed = true;
  }

  loadQuestion(): void {
    if (this.emailForm.invalid) return;

    if (!this.recaptchaToken) {
      this.recaptchaError = true;
      return;
    }

    const dto: SecurityQuestionRequestDto = {
      email: this.email.value,
      recaptchaToken: this.recaptchaToken
    };

    this.setLoading(true);

    this.subscriptions.add(
      this.securityQuestionService.getSecurityQuestion(dto)
      .pipe(finalize(() => this.setLoading(false)))
      .subscribe({
        next: (res: any) => {
          this.securityQuestionService.setQuestionLoaded(true);
          this.securityQuestionService.setUserEmail(this.email.value);
          
          this.router.navigate(['/security-question/answer'], {
            queryParams: {
              email: this.email.value,
              question: res.securityQuestion,
              sessionToken: res.sessionToken
            }
          });

          this.recaptchaToken = '';
          this.captchaResolved = false;
        },
        error: (error) => {
          const isCaptchaFailure =
            error?.status === 400 &&
            (typeof error?.error === 'string' && error.error.toLowerCase().includes('captcha')
            || error?.error?.error?.toLowerCase().includes('captcha'));

          if (isCaptchaFailure) {
            this.notification.show('CAPTCHA validation failed. Please try again.', 'Close');
          } else {
            this.notification.show('Failed to load security question. Please try again.', 'Close');
          }

          this.recaptchaToken = '';
          this.captchaResolved = false;
          this.recaptchaError = true;
          this.tryWidgetReset();
        }
      })
    );
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

  resetCaptcha(): void {
    if (!this.captchaResolved) return;

    this.recaptchaToken = '';
    this.captchaResolved = false;
    this.recaptchaError = false;
    this.tryWidgetReset();
  }

  cancel(): void {
    this.securityQuestionService.clear();
    this.resetCaptcha();
    this.router.navigate(['/forgot-password']);
  }

  setLoading(isLoading: boolean) {
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

  get email(): FormControl {
    return this.emailForm.get('email')! as FormControl;
  }
}
