import { Component, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../shared/modules/material.module';
import { NotificationService } from '../../../shared/services/notification.service';
import { AuthService } from '../services/auth.service';
import { ForgotPasswordDto } from '../models/forgot-password.dto';
import { RecaptchaModule, RecaptchaFormsModule, RecaptchaComponent } from 'ng-recaptcha';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
    RecaptchaModule,
    RecaptchaFormsModule
  ],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent {
  forgotForm: FormGroup;
  submitting = false;

  // Recaptcha handling
  @ViewChild('captchaRef', { read: RecaptchaComponent, static: false }) captchaRef?: RecaptchaComponent;
  recaptchaToken = '';
  private _isResettingCaptcha = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private notification: NotificationService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.forgotForm = this.fb.group({
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(254)
      ]]
    });
  }
  
  onSubmit(): void {
    if (this.forgotForm.invalid || this.submitting)
      return;

    // Require captcha token
    if (!this.recaptchaToken) {
      this.forgotForm.setErrors({ captchaMissing: true });
      this.notification.show('Please complete the captcha', 'Close');
      return;
    } else if (this.forgotForm.hasError('captchaMissing')) {
      this.forgotForm.setErrors(null);
    }

    this.submitting = true;

    const dto: ForgotPasswordDto = {
      email: this.forgotForm.value.email,
      recaptchaToken: this.recaptchaToken
    };

    this.authService.forgotPassword(dto)
      .pipe(finalize(() => {
        // Run outside angular then schedule next tick
        this.ngZone.runOutsideAngular(() => setTimeout(() => this.ngZone.run(() => {
          this.submitting = false;
        }), 0));
      }))
      .subscribe({
        next: (res: any) => {
          const msg = res?.Message ?? 'If your email is registered and confirmed, you will receive a password reset link.';
          this.notification.show(msg);
          this._clearRecaptchaTokenAndWidget();
        },
        error: () => {
          this.notification.show('Failed to send reset link.', 'Close');

          // Reset widget + form value
          this.resetRecaptchaWidget();
        }
      });
  }

   goToSecurityQuestion(): void {
    this.router.navigate(['/security-question/start']);
  }

  cancel(): void {
    this.router.navigate(['/login']);
  }

  // Handle recaptcha resolution
  onCaptchaResolved(token: string | null) {
    if (this._isResettingCaptcha) return;
    this.recaptchaToken = token ?? '';
  }

  // Handle recaptcha expiration
  onCaptchaExpired() {
    if (this._isResettingCaptcha) return;
    this.recaptchaToken = '';
  }

  // Reset the recaptcha widget
  private resetRecaptchaWidget() {
    if (this._isResettingCaptcha) return;
    this._isResettingCaptcha = true;

    // Clear token field
    this.recaptchaToken = '';

    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        try {
          this.ngZone.run(() => {
            if (this.captchaRef && typeof this.captchaRef.reset === 'function') {
              this.captchaRef.reset();
            } else {
              try { (window as any)?.grecaptcha?.reset?.(); } catch (_) {}
            }
          });
        } finally {
          this._isResettingCaptcha = false;
        }
      }, 0);
    });
  }

  // Clear recaptcha token and reset widget
  private _clearRecaptchaTokenAndWidget() {
    this.recaptchaToken = '';
    setTimeout(() => this.resetRecaptchaWidget(), 0);
  }

  get email() {
    return this.forgotForm.get('email')!;
  }
}