import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/modules/material.module';

class MockAuthService {
  getProfile = jasmine.createSpy('getProfile');
  updateProfile = jasmine.createSpy('updateProfile');
}

class MockNotificationService {
  show = jasmine.createSpy('show');
}

class MockRouter {
  navigate = jasmine.createSpy('navigate');
}

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let authService: MockAuthService;
  let notification: MockNotificationService;
  let router: MockRouter;

  const initialProfile = { email: 'a@b.com', firstName: 'A', lastName: 'B' };

  beforeEach(async () => {
    authService = new MockAuthService();
    notification = new MockNotificationService();
    router = new MockRouter();

    // Default behavior: getProfile returns a valid profile so ngOnInit can subscribe safely
    authService.getProfile.and.returnValue(of(initialProfile));
    // Default updateProfile returns success (tests that need failure will override)
    authService.updateProfile.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, CommonModule, MaterialModule, ProfileComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: NotificationService, useValue: notification },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;

    // allow Angular lifecycle to run (ngOnInit -> loadProfile will subscribe to the stub)
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with empty controls', () => {
    // ngOnInit already ran in beforeEach via detectChanges(); just assert controls exist
    expect(component.profileForm.contains('email')).toBeTrue();
    expect(component.profileForm.contains('firstName')).toBeTrue();
    expect(component.profileForm.contains('lastName')).toBeTrue();
  });

  it('should load profile on init', () => {
    // getProfile is stubbed to return initialProfile in beforeEach
    expect(authService.getProfile).toHaveBeenCalled();
    expect(component.profileForm.value.email).toEqual(initialProfile.email);
    expect(component.profileForm.value.firstName).toEqual(initialProfile.firstName);
    expect(component.profileForm.value.lastName).toEqual(initialProfile.lastName);
    expect(component.loading).toBeFalse();
  });

  it('should show notification on loadProfile error', () => {
    // override getProfile to fail
    authService.getProfile.and.returnValue(throwError(() => new Error('Error')));
    // call private loadProfile via runtime cast (keeps method private in production)
    (component as any).loadProfile();
    expect(notification.show).toHaveBeenCalledWith('Failed to load profile.', 'Close');
    expect(component.loading).toBeFalse();
  });

  it('should not submit if form is invalid', () => {
    // make form invalid
    component.profileForm.setValue({ email: '', firstName: '', lastName: '' });
    component.onSubmit();
    expect(authService.updateProfile).not.toHaveBeenCalled();
  });

  it('should submit valid form and show success notification', () => {
    // ensure getProfile returns something predictable
    authService.getProfile.and.returnValue(of(initialProfile));
    // call private loadProfile to set originalProfile (via cast)
    (component as any).loadProfile();

    // change the form so isFormChanged becomes true
    component.profileForm.patchValue({ firstName: 'AA' });

    // ensure updateProfile returns success for this test
    authService.updateProfile.and.returnValue(of(void 0));

    component.onSubmit();

    expect(authService.updateProfile).toHaveBeenCalledWith({
      email: initialProfile.email,
      firstName: 'AA',
      lastName: initialProfile.lastName
    });
    expect(notification.show).toHaveBeenCalledWith('Profile updated successfully.', 'Close');
  });

  it('should show error notification on updateProfile failure', () => {
    // set initial profile
    authService.getProfile.and.returnValue(of(initialProfile));
    (component as any).loadProfile();

    // change something so submit proceeds
    component.profileForm.patchValue({ lastName: 'BB' });

    // make updateProfile fail
    authService.updateProfile.and.returnValue(throwError(() => new Error('Fail')));

    component.onSubmit();

    expect(authService.updateProfile).toHaveBeenCalled();
    expect(notification.show).toHaveBeenCalledWith('Failed to update profile.', 'Close');
  });

  it('should reset form and navigate on cancel', () => {
    // ensure originalProfile present
    authService.getProfile.and.returnValue(of(initialProfile));
    (component as any).loadProfile();

    // mutate form (simulate user edits) before cancel
    component.profileForm.patchValue({ firstName: 'X' });

    component.cancel();

    // form should reset back to originalProfile
    expect(component.profileForm.value.email).toEqual(initialProfile.email);
    expect(component.profileForm.value.firstName).toEqual(initialProfile.firstName);
    expect(component.profileForm.value.lastName).toEqual(initialProfile.lastName);

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should navigate to change-password page', () => {
    component.goToChangePassword();
    expect(router.navigate).toHaveBeenCalledWith(['/profile/change-password']);
  });
});
