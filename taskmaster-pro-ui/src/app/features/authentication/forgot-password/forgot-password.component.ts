import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../shared/modules/material.module';
import { NotificationService } from '../../../shared/services/notification.service';
import { AuthService } from '../services/auth.service';
import { ForgotPasswordDto } from '../models/forgot-password.dto';
import { RecaptchaModule, RecaptchaFormsModule } from 'ng-recaptcha';

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

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private notification: NotificationService,
    private router: Router
  ) {
    this.forgotForm = this.fb.group({
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(254)
      ]],
      recaptchaToken: ['', Validators.required]
    });
  }
  
  onSubmit(): void {
    if (this.forgotForm.invalid || this.submitting)
      return;

    this.submitting = true;

    const dto: ForgotPasswordDto = {
      email: this.forgotForm.value.email,
      recaptchaToken: this.forgotForm.value.recaptchaToken
    };

    this.authService.forgotPassword(dto).subscribe({
      next: () => {
        this.notification.show('Reset link sent to your email.');
      },
      error: () => {
        this.notification.show('Failed to send reset link.', 'Close');
      },
      complete: () => {
        this.submitting = false;
      }
    });
  }

   goToSecurityQuestion(): void {
    this.router.navigate(['/security-question/start']);
  }

  cancel(): void {
    this.router.navigate(['/login']);
  }

  onCaptchaResolved(token: string | null) {
    if (token) {
      this.forgotForm.patchValue({ recaptchaToken: token });
    }
    else {
      this.forgotForm.patchValue({ recaptchaToken: '' });
    }
  }

  get email() {
    return this.forgotForm.get('email')!;
  }
  get recaptcha() {
    return this.forgotForm.get('recaptchaToken');
  }
}