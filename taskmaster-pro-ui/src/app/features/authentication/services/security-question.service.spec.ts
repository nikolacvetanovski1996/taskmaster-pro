import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SecurityQuestionService } from './security-question.service';
import { environment } from '../../../../environments/environment';
import { SecurityQuestionRequestDto } from '../models/security-question-request.dto';
import { VerifySecurityAnswerDto } from '../models/verify-security-answer.dto';
import { SecurityQuestionResponseDto } from '../models/security-question-response.dto';

describe('SecurityQuestionService', () => {
  let service: SecurityQuestionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SecurityQuestionService]
    });

    service = TestBed.inject(SecurityQuestionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getSecurityQuestion should call API with correct DTO', () => {
    const dto: SecurityQuestionRequestDto = { email: 'a@b.com', recaptchaToken: 'token123' };
    const response: SecurityQuestionResponseDto = { securityQuestion: 'Pet name?', sessionToken: 'sess123' };

    service.getSecurityQuestion(dto).subscribe(res => {
      expect(res).toEqual(response);
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Authentication/get-security-question`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(response);
  });

  it('verifySecurityAnswer should call API with correct DTO', () => {
    const dto: VerifySecurityAnswerDto = { email: 'a@b.com', securityAnswer: 'Fluffy', recaptchaToken: 'token123', sessionToken: 'sess123' };
    const response = { token: 'jwt123' };

    service.verifySecurityAnswer(dto).subscribe(res => {
      expect(res).toEqual(response);
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Authentication/verify-security-answer`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(response);
  });

  it('should set and get questionLoaded', () => {
    service.setQuestionLoaded(true);
    expect(service.isQuestionLoaded()).toBeTrue();
    service.setQuestionLoaded(false);
    expect(service.isQuestionLoaded()).toBeFalse();
  });

  it('should set and get userEmail', () => {
    service.setUserEmail('a@b.com');
    expect(service.getUserEmail()).toBe('a@b.com');
  });

  it('clear should reset questionLoaded and userEmail', () => {
    service.setQuestionLoaded(true);
    service.setUserEmail('a@b.com');
    service.clear();
    expect(service.isQuestionLoaded()).toBeFalse();
    expect(service.getUserEmail()).toBeNull();
  });
});
