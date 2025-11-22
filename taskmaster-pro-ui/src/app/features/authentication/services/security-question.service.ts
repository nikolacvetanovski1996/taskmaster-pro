import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SecurityQuestionRequestDto } from '../models/security-question-request.dto';
import { SecurityQuestionResponseDto } from '../models/security-question-response.dto';
import { VerifySecurityAnswerDto } from '../models/verify-security-answer.dto';

@Injectable({
  providedIn: 'root'
})
export class SecurityQuestionService {
  private readonly apiUrl = `${environment.apiBaseUrl}`;
  private questionLoaded = false;
  private userEmail: string | null = null;

  constructor(private http: HttpClient) {}

  getSecurityQuestion(dto: SecurityQuestionRequestDto): Observable<SecurityQuestionResponseDto> {
    return this.http.post<SecurityQuestionResponseDto>(
      `${this.apiUrl}/Authentication/get-security-question`, dto
    );
  }

  verifySecurityAnswer(dto: VerifySecurityAnswerDto) {
    return this.http.post<{ token: string }>(
      `${this.apiUrl}/Authentication/verify-security-answer`, dto
    );
  }

  setQuestionLoaded(loaded: boolean): void {
    this.questionLoaded = loaded;
  }

  isQuestionLoaded(): boolean {
    return this.questionLoaded;
  }

  setUserEmail(email: string): void {
    this.userEmail = email;
  }

  getUserEmail(): string | null {
    return this.userEmail;
  }

  clear(): void {
    this.questionLoaded = false;
    this.userEmail = null;
  }
}
