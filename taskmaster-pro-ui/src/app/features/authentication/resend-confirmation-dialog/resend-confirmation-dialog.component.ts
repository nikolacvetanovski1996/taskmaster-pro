import { Component, EventEmitter, Output, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { RecaptchaModule, RecaptchaFormsModule, RecaptchaComponent } from 'ng-recaptcha';
import { ResendDialogData } from '../models/resend-dialog-data';
import { MaterialModule } from '../../../shared/modules/material.module';

@Component({
  selector: 'app-resend-confirmation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    RecaptchaModule,
    RecaptchaFormsModule
  ],
  templateUrl: './resend-confirmation-dialog.component.html',
  styleUrls: ['./resend-confirmation-dialog.component.scss'],
})
export class ResendConfirmationDialogComponent {
  captchaResolved = false;
  captchaError = false;
  captchaToken = '';
  isLoading = false;

  // Local cooldown so button can show
  isResendDisabled = false;
  resendCooldownSeconds = 0;
  private cooldownInterval?: ReturnType<typeof setInterval>;

  @ViewChild(RecaptchaComponent) recaptchaRef?: RecaptchaComponent;
  @Output() resend = new EventEmitter<string>();

  constructor(
    public dialogRef: MatDialogRef<ResendConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ResendDialogData
  ) {
    // initialize from data if passed
    this.isResendDisabled = !!data?.isResendDisabled;
    this.resendCooldownSeconds = data?.resendCooldownSeconds ?? 0;
    if (this.isResendDisabled && this.resendCooldownSeconds > 0) {
      this.startCooldown(this.resendCooldownSeconds);
    }
  }

  onCaptchaResolved(token: string | null): void {
    this.captchaToken = token || '';
    this.captchaResolved = !!token;
    this.captchaError = false;
  }
    
  onCaptchaExpired(): void {
    this.captchaToken = '';
    this.captchaResolved = false;
    this.captchaError = true;
  }

  onResend() {
    if (!this.captchaToken) {
      this.captchaError = true;
      return;
    }
    this.isLoading = true;
    this.dialogRef.disableClose = true; 
    this.resend.emit(this.captchaToken);
  }

  onCancel() {
    this.dialogRef.close({ confirmed: false });
  }

  resetCaptcha() {
    this.captchaToken = '';
    this.captchaResolved = false;
    this.captchaError = false;
    this.recaptchaRef?.reset();
    }

  startCooldown(seconds: number) {
    if (this.cooldownInterval) clearInterval(this.cooldownInterval);
    this.isResendDisabled = true;
    this.resendCooldownSeconds = seconds;

    this.cooldownInterval = setInterval(() => {
      this.resendCooldownSeconds--;
      if (this.resendCooldownSeconds <= 0) {
        if (this.cooldownInterval) {
          clearInterval(this.cooldownInterval);
          this.cooldownInterval = undefined;
        }
        this.isResendDisabled = false;
        this.resendCooldownSeconds = 0;
      }
    }, 1000);
  }
}
