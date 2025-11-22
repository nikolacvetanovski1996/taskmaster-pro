import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../shared/modules/material.module';
import { NotificationService } from '../../../shared/services/notification.service';
import { AuthService } from '../services/auth.service';
import { ResetPasswordDto } from '../models/reset-password.dto';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule
  ],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
  resetForm!: FormGroup;
  passwordStrength: number = 0; // 0–100 scale
  passwordStrengthLabel = 'Weak';
  hideNewPassword = true;
  hideConfirmPassword = true;

  private subs = new Subscription();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private authService: AuthService,
    private notification: NotificationService,
    private router: Router
    ) {}

  ngOnInit(): void {
    this.resetForm = this.fb.group({
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(254)
      ]],
      token: ['', Validators.required],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        // At least one lowercase, one uppercase, and one digit
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
      ]],
      confirmPassword: ['', Validators.required]
    }, {
      validators: this.matchPasswords('password', 'confirmPassword')
    });

    this.route.queryParams.subscribe(params => {
      const token = params['token'];
      const email = decodeURIComponent(params['email']);

      if (token && email) {
        this.resetForm.patchValue({ token, email });
      }
      else {
        this.notification.show('Invalid or expired reset link.');
        this.router.navigate(['/login']);
      }
    });

    // Password strength detector
    this.password.valueChanges.subscribe(value => {
      const score = this.calculatePasswordStrength(value);
      this.passwordStrength = score;

      if (score < 40) {
        this.passwordStrengthLabel = 'Weak';
      } else if (score < 60) {
        this.passwordStrengthLabel = 'Medium';
      } else if (score < 80) {
        this.passwordStrengthLabel = 'Strong';
      } else {
        this.passwordStrengthLabel = 'Very Strong';
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onSubmit(): void {
    const password = this.resetForm.get('password')?.value;
    const confirmPassword = this.resetForm.get('confirmPassword')?.value;
    const email = this.resetForm.get('email')?.value;
    const token = this.resetForm.get('token')?.value;
    
    if (password !== confirmPassword) {
      this.notification.show('Passwords do not match.');
      return;
    }

    if (this.resetForm.invalid)
      return;

    const dto: ResetPasswordDto = {
      email,
      password: password,
      confirmPassword,
      token
    };

    const sub = this.authService.resetPassword(dto).subscribe({
      next: () => {
        this.notification.show('Password reset successful.');
        this.router.navigate(['/login']);
      },
      error: (err: any) => {
        // If server returned explicit "Invalid request" or similar (user missing): suggest requesting new reset
        if (err?.status === 400 && (typeof err.error === 'string' && err.error.includes('Invalid request')
            || err?.error?.errors?.some((e: any) => typeof e === 'string' && e.includes('Invalid request')))) {
          // Show friendly guidance and a CTA (user can go to forgot-password)
          this.notification.show('Reset failed. The reset link looks invalid or expired. Request a new password reset.', 'Close');
          return;
        }

        // Default fallback: generic invalid token message + suggest new reset
        this.notification.show('Failed to reset password. Link may be expired or invalid. Request a new password reset.', 'Close');
      }
    });

    this.subs.add(sub);
  }
  
  cancel(): void {
    this.router.navigate(['/login']);
  }

  matchPasswords(pwKey: string, confirmKey: string) {
    return (group: FormGroup) => {
      const pw = group.controls[pwKey];
      const cp = group.controls[confirmKey];
      if (pw.value !== cp.value) cp.setErrors({ mismatch: true });
      else cp.setErrors(null);
    };
  }

  // Calculate password strength based on length, case, digits, and symbols
  calculatePasswordStrength(pw: string): number {
    let score = 0;
    if (!pw) return 0;
    score += Math.min(10, pw.length) * 5;              // up to 50%
    if (/[A-Z]/.test(pw)) score += 15;                 // uppercase bonus
    if (/[a-z]/.test(pw)) score += 15;                 // lowercase bonus
    if (/\d/.test(pw))  score += 10;                   // digits
    if (/[\W_]/.test(pw)) score += 10;                 // symbols
    return Math.min(score, 100);
  }

  get email() {
    return this.resetForm.get('email')!;
  }
  get password() {
    return this.resetForm.get('password')!;
  }
  get confirmPassword() {
    return this.resetForm.get('confirmPassword')!;
  }
}
