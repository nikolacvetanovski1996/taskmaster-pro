import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { catchError, tap, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { LoginDto } from '../models/login.dto';
import { RegisterDto } from '../models/register.dto';
import { ForgotPasswordDto } from '../models/forgot-password.dto';
import { ResetPasswordDto } from '../models/reset-password.dto';
import { ConfirmEmailDto } from '../models/confirm-email.dto';
import { ProfileDto } from '../models/profile.dto';
import { ChangePasswordDto } from '../models/change-password.dto';
import { ResendConfirmationDto } from '../models/resend-confirmation.dto';
import { environment } from '../../../../environments/environment';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = `${environment.apiBaseUrl}`;
  private isLoggedInSubject = new BehaviorSubject<boolean>(!!localStorage.getItem('jwt'));
  isLoggedIn$ = this.isLoggedInSubject.asObservable();
  private isAdminSubject = new BehaviorSubject<boolean>(false);
  isAdmin$ = this.isAdminSubject.asObservable();
  private roleSubject = new BehaviorSubject<string | null>(null);
  role$ = this.roleSubject.asObservable();

  constructor(private http: HttpClient) {
    this.updateFromToken(); 
  }

  login(dto: LoginDto): Observable<{ token: string }> {
    return this.http.post<{ token: string }>(
      `${this.apiUrl}/Authentication/login`, dto
    ).pipe(
      tap(res => {
        this.setToken(res.token);
        this.isLoggedInSubject.next(true);
      }),
      catchError((err: HttpErrorResponse) => {
        return throwError(() => err);
      })
    )
  };

  register(dto: RegisterDto): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/Authentication/register`, dto
    );
  }

  forgotPassword(dto: ForgotPasswordDto): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/Authentication/forgot-password`, dto
    );
  }

  confirmEmail(dto: ConfirmEmailDto): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/Authentication/confirm-email`, dto
    );
  }

  resendConfirmationLink(dto: ResendConfirmationDto): Observable<any> {
    return this.http.post<void>(
      `${this.apiUrl}/Authentication/resend-confirmation-link`, dto
    );
  }
  
  resetPassword(dto: ResetPasswordDto): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/Authentication/reset-password`, dto
    );
  }

  getProfile(): Observable<ProfileDto> {
    return this.http.get<ProfileDto>(
      `${this.apiUrl}/Users/me`
    );
  }

  updateProfile(dto: ProfileDto): Observable<void> {
    return this.http.put<void>(
      `${this.apiUrl}/Users/me`, dto
    );
  }

  changePassword(dto: ChangePasswordDto) {
    return this.http.post<void>(
      `${this.apiUrl}/users/change-password`, dto
    );
  }

  logout(): void {
    localStorage.removeItem('jwt');
    this.isLoggedInSubject.next(false);
    this.isAdminSubject.next(false);
  }
  
  logoutIfExpired(): void {
    const token = localStorage.getItem('jwt');
    if (!token) return;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expired = payload.exp * 1000 < Date.now();
      if (expired) {
        this.logout();
      }
    } catch {
      this.logout();
    }
  }

  getCurrentUser(): { id: string | null; isAdmin: boolean } | null {
    const token = localStorage.getItem('jwt');
    if (!token) return null;

    try {
      const decoded: any = jwtDecode(token);

      const userId = decoded.sub || null;
      const role = decoded.role ?? null;

      return { id: userId, isAdmin: role === 'Admin' };
    } catch {
      return null;
    }
  }
  
  getUserRole(): string | null {
    const token = localStorage.getItem('jwt');
    if (!token) return null;

    try {
      const decoded = jwtDecode<any>(token);
      return decoded.role ?? null;
    } catch {
      return null;
    }
  }

  setToken(token: string) {
    localStorage.setItem('jwt', token);
    this.updateFromToken();
  }

  updateFromToken() {
    const token = localStorage.getItem('jwt');
    if (!token) {
      this.isAdminSubject.next(false);
      return;
    }
    try {
      const decoded: any = JSON.parse(atob(token.split('.')[1]));

      const roles: string[] = Array.isArray(decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'])
      ? decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
      : [decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']];

      this.isAdminSubject.next(roles.includes('Admin'));
      this.roleSubject.next(roles.join(',')); 
    } catch {
      this.isAdminSubject.next(false);
      this.roleSubject.next(null); 
    }
  }
}
