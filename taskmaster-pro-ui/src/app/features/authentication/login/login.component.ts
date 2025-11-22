import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, throwError } from 'rxjs';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MaterialModule } from '../../../shared/modules/material.module';
import { NotificationService } from '../../../shared/services/notification.service';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../models/login.dto';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ResendConfirmationDto } from '../models/resend-confirmation.dto';
import { ResendConfirmationDialogComponent } from '../resend-confirmation-dialog/resend-confirmation-dialog.component';
import { ResendDialogData } from '../models/resend-dialog-data';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
    MatDialogModule,
    RouterModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm!: FormGroup;
  hidePassword = true;

  // Resend confirmation state
  isResendDisabled = false;
  resendCooldownSeconds = 0;
  private resendInterval?: ReturnType<typeof setInterval>;

  private subs = new Subscription();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private notification: NotificationService,
    private router: Router,
    public dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(254)
      ]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
      this.resendInterval = undefined;
    }
  }

  submit(): void {
     if (this.loginForm.invalid)
      return;

    const dto: LoginDto = {
      email: this.loginForm.value.email,
      password: this.loginForm.value.password
    };

    this.authService.login(dto).subscribe({
      next: () => {
        this.notification.show('Login successful!');
        this.router.navigate(['/dashboard']);
      },
      error: (err: any) => {
        // Check for EmailNotConfirmed sentinel (403)
        if (err?.status === 403 && err?.error?.code === 'EmailNotConfirmed') {
          console.log('Login error:', err);
          this.handleEmailNotConfirmed(dto.email);
          return;
        }

        // Fallback
        this.notification.show('Invalid credentials', 'Close');
      }
    });
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

  get email() {
    return this.loginForm.get('email')!;
  }

  get password() {
    return this.loginForm.get('password')!;
  }
}
