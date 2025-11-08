import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../shared/modules/material.module';
import { RegisterDto } from '../models/register.dto';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { RecaptchaModule, RecaptchaFormsModule } from 'ng-recaptcha';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
    RecaptchaModule,
    RecaptchaFormsModule
  ],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  passwordStrength: number = 0; // 0–100 scale
  passwordStrengthLabel = 'Weak';
  hidePassword = true;
  hideConfirmPassword  = true;
  submitting = false;

  // Predefined security questions
  securityQuestions = [
    'What was your childhood nickname?',
    'What is the name of your first pet?',
    'What is your mother’s maiden name?',
    'What was the make of your first car?',
    'In what city were you born?'
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private notification: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      firstName: ['', [
        Validators.required,
        Validators.maxLength(100)
      ]],
      lastName: ['', [
        Validators.required,
        Validators.maxLength(100)
      ]],
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(254)
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        // At least one lowercase, one uppercase, and one digit
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
      ]],
      confirmPassword: ['', [Validators.required]],
      securityQuestion: ['',[Validators.required]],
      securityAnswer: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(100)
      ]],
      recaptchaToken: ['', [Validators.required]]
    }, {
      validators: this.matchPasswords('password', 'confirmPassword')
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

  submit(): void {
    if (this.registerForm.invalid || this.submitting)
      return;

    this.submitting = true;

    const dto: RegisterDto = {
      firstName: this.registerForm.value.firstName,
      lastName: this.registerForm.value.lastName,
      email: this.registerForm.value.email,
      password: this.registerForm.value.password,
      confirmPassword: this.registerForm.value.confirmPassword,
      securityQuestion: this.registerForm.value.securityQuestion,
      securityAnswer: this.registerForm.value.securityAnswer,
      recaptchaToken: this.registerForm.value.recaptchaToken
    };

    this.authService.register(dto).subscribe({
      next: () => {
        this.notification.show('Registration successful. Please check your email to confirm your account.');
        this.router.navigate(['/login']);
      },
      error: () => {
        this.notification.show('Registration failed', 'Close');
      },
      complete: () => {
        this.submitting = false;
      }
    });
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

  onCaptchaResolved(token: string | null) {
    if (token) {
      this.registerForm.patchValue({ recaptchaToken: token });
    }
    else {
      this.registerForm.patchValue({ recaptchaToken: '' });
    }
  }

  get firstName() {
    return this.registerForm.get('firstName')! as FormControl;
  }
  get lastName() {
    return this.registerForm.get('lastName')! as FormControl;
  }
  get email() {
    return this.registerForm.get('email')! as FormControl;
  }
  get password() {    
    return this.registerForm.get('password')! as FormControl;
  }
  get confirmPassword() {
    return this.registerForm.get('confirmPassword')! as FormControl;
  }
  get securityQuestion() {
    return this.registerForm.get('securityQuestion')! as FormControl;
  }
  get securityAnswer() {
    return this.registerForm.get('securityAnswer')! as FormControl;
  }
  get recaptcha() {
    return this.registerForm.get('recaptchaToken')! as FormControl;
  }
}
