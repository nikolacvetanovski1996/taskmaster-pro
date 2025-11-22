import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from '../../../../environments/environment';
import { ChangePasswordDto } from '../models/change-password.dto';
import { ConfirmEmailDto } from '../models/confirm-email.dto';
import { ForgotPasswordDto } from '../models/forgot-password.dto';
import { LoginDto } from '../models/login.dto';
import { ProfileDto } from '../models/profile.dto';
import { RegisterDto } from '../models/register.dto';
import { ResendConfirmationDto } from '../models/resend-confirmation.dto';
import { ResetPasswordDto } from '../models/reset-password.dto';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('login should set token and isLoggedIn', (done) => {
    const token = 'test.jwt.token';
    const dto: LoginDto = { email: 'a@b.com', password: '1234' };

    service.login(dto).subscribe({
      next: (res) => {
        expect(localStorage.getItem('jwt')).toBe(token);
        service.isLoggedIn$.subscribe(val => {
          expect(val).toBeTrue();
          done();
        });
      }
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Authentication/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({ token });
  });

  it('should call register with proper DTO', () => {
    const dto: RegisterDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@test.com',
      password: '1234',
      confirmPassword: '1234',
      securityQuestion: 'Pet name?',
      securityAnswer: 'Fluffy',
      recaptchaToken: 'token123'
    };

    service.register(dto).subscribe();

    const req = httpMock.expectOne(`${service['apiUrl']}/Authentication/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({});
  });

  it('should call forgotPassword with proper DTO', () => {
    const dto: ForgotPasswordDto = {
      email: 'john.doe@test.com',
      recaptchaToken: 'token123'
    };

    service.forgotPassword(dto).subscribe();

    const req = httpMock.expectOne(`${service['apiUrl']}/Authentication/forgot-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({});
  });

  it('should call confirmEmail with proper DTO', () => {
    const dto: ConfirmEmailDto = { userId: '123', token: 'token123' };

    service.confirmEmail(dto).subscribe();

    const req = httpMock.expectOne(`${service['apiUrl']}/Authentication/confirm-email`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(null);
  });

  it('should call resendConfirmationLink with proper DTO', () => {
    const dto: ResendConfirmationDto = { email: 'test@example.com', recaptchaToken: 'token123' };

    service.resendConfirmationLink(dto).subscribe();

    const req = httpMock.expectOne(`${service['apiUrl']}/Authentication/resend-confirmation-link`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(null);
  });

  it('resetPassword should call API with ResetPasswordDto', () => {
    const dto: ResetPasswordDto = { email: 'a@b.com', password: '1234', confirmPassword: '1234', token: 'abc' };
    service.resetPassword(dto).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Authentication/reset-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(null);
  });

  it('getProfile should call API and return ProfileDto', () => {
    const profile: ProfileDto = { firstName: 'John', lastName: 'Doe', email: 'a@b.com' } as ProfileDto;
    service.getProfile().subscribe(res => {
      expect(res).toEqual(profile);
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Users/me`);
    expect(req.request.method).toBe('GET');
    req.flush(profile);
  });

  it('should call updateProfile with proper DTO', () => {
    const dto: ProfileDto = { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };

    service.updateProfile(dto).subscribe();

    const req = httpMock.expectOne(`${service['apiUrl']}/Users/me`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(dto);
    req.flush(null);
  });

  it('should call changePassword with proper DTO', () => {
    const dto: ChangePasswordDto = { currentPassword: 'oldPass', newPassword: 'newPass', confirmPassword: 'newPass' };

    service.changePassword(dto).subscribe();

    const req = httpMock.expectOne(`${service['apiUrl']}/users/change-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(null);
  });

  it('logout should clear localStorage and isLoggedIn', () => {
    localStorage.setItem('jwt', 'token');
    service.logout();
    expect(localStorage.getItem('jwt')).toBeNull();
    service.isLoggedIn$.subscribe(val => expect(val).toBeFalse());
  });

  it('getCurrentUser should decode JWT and return user id and isAdmin', () => {
    const payload = { sub: '123', role: 'Admin' };
    const base64Payload = btoa(JSON.stringify(payload));
    const fakeToken = `header.${base64Payload}.signature`;
    localStorage.setItem('jwt', fakeToken);

    const user = service.getCurrentUser();
    expect(user).toEqual({ id: '123', isAdmin: true });
  });

  it('getCurrentUser should return null if no token', () => {
    localStorage.removeItem('jwt');
    expect(service.getCurrentUser()).toBeNull();
  });

  it('getCurrentUser should return null if token is invalid', () => {
    localStorage.setItem('jwt', 'invalid.token.here');
    expect(service.getCurrentUser()).toBeNull();
  });
});
