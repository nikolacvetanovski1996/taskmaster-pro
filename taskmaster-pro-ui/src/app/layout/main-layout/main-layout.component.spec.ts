import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MainLayoutComponent } from './main-layout.component';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from '../../features/authentication/services/auth.service';
import { BehaviorSubject, Subject, firstValueFrom, of } from 'rxjs';
import { take } from 'rxjs/operators';

class MockRouter {
  url = '/';
  // Use a Subject so tests can emit router events without the real Router
  events = new Subject<any>();
  navigate = jasmine.createSpy('navigate');
  createUrlTree = jasmine.createSpy('createUrlTree');
}

class MockAuthService {
  isLoggedIn$ = of(true);
  isAdmin$ = new BehaviorSubject<boolean>(false);
  logout = jasmine.createSpy('logout');
}

describe('MainLayoutComponent', () => {
  let component: MainLayoutComponent;
  let fixture: ComponentFixture<MainLayoutComponent>;
  let router: MockRouter;
  let auth: MockAuthService;

  beforeEach(waitForAsync(async () => {
    router = new MockRouter();
    auth = new MockAuthService();

    const breakpointObserverStub = {
      isMatched: jasmine.createSpy('isMatched').and.returnValue(false),
      observe: jasmine.createSpy('observe').and.returnValue(of({ matches: false }))
    };
  
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent], // standalone component
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth },
        { provide: BreakpointObserver, useValue: breakpointObserverStub }
      ],
    })
      // Override template to avoid instantiating RouterLink/Material in tests
      .overrideComponent(MainLayoutComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(MainLayoutComponent);
    component = fixture.componentInstance;

    // Mock sidenav for spying
    component.sidenav = {
      open: jasmine.createSpy('open'),
      close: jasmine.createSpy('close')
    } as any;

    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle sidenav', () => {
    component.isSidenavOpen = false;  // Explicitly reset initial state to false

    expect(component.isSidenavOpen).toBeFalse();
    component.toggleSidenav();
    expect(component.isSidenavOpen).toBeTrue();
    component.toggleSidenav();
    expect(component.isSidenavOpen).toBeFalse();
  });

  it('should navigate to profile', () => {
    component.goToProfile();
    expect(router.navigate).toHaveBeenCalledWith(['/profile']);
  });

  it('should logout and redirect to login', () => {
    component.isSidenavOpen = true;
    component.logout();
    expect(auth.logout).toHaveBeenCalled();
    expect(component.isSidenavOpen).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should subscribe to isAdmin$', () => {
    expect(component.isAdmin).toBeFalse();
    auth.isAdmin$.next(true);
    expect(component.isAdmin).toBeTrue();
  });

  it('should detect admin route from router events', async () => {
    // start on non-admin route
    router.url = '/orders';
    router.events.next(new NavigationEnd(1, '/orders', '/orders'));

    let value = await firstValueFrom(component.isAdminRoute$.pipe(take(1)));
    expect(value).toBeFalse();

    // switch to an admin route and emit a new event
    router.url = '/admin/users';
    router.events.next(new NavigationEnd(2, '/admin/users', '/admin/users'));

    value = await firstValueFrom(component.isAdminRoute$.pipe(take(1)));
    expect(value).toBeTrue();
  });

  it('should set isMobile, sidenavMode, and isSidenavOpen based on breakpointObserver.isMatched on init', () => {
    const breakpointObserver = TestBed.inject(BreakpointObserver);

    // Set mock sidenav spies before calling ngOnInit again
    component.sidenav = {
      open: jasmine.createSpy('open'),
      close: jasmine.createSpy('close')
    } as any;

    // Call ngOnInit after setting the mock
    component.ngOnInit();

    // Check initial conditions
    expect(component.isMobile).toBeFalse();
    expect(component.sidenavMode).toBe('side');
    expect(component.isSidenavOpen).toBeTrue();
    expect(component.sidenav.open).toHaveBeenCalled();

    // Change breakpoint observable to simulate handset (mobile)
    (breakpointObserver.observe as jasmine.Spy).and.returnValue(of({ matches: true }));

    // Call ngOnInit again to trigger breakpoint changes
    component.ngOnInit();

    expect(component.isMobile).toBeTrue();
    expect(component.sidenavMode).toBe('over');
    expect(component.isSidenavOpen).toBeFalse();
    expect(component.sidenav.close).toHaveBeenCalled();
  });

  it('should call sidenav.open() when not mobile and sidenav.close() when mobile on breakpoint change', () => {
    const breakpointObserver = TestBed.inject(BreakpointObserver);

    // Re-mock sidenav before calling ngOnInit()
    component.sidenav = {
      open: jasmine.createSpy('open'),
      close: jasmine.createSpy('close')
    } as any;

    const sidenavOpenSpy = component.sidenav.open;
    const sidenavCloseSpy = component.sidenav.close;

    // Simulate breakpoint = desktop (handset=false)
    (breakpointObserver.observe as jasmine.Spy).and.returnValue(of({ matches: false }));
    component.ngOnInit();

    expect(component.isMobile).toBeFalse();
    expect(sidenavOpenSpy).toHaveBeenCalled();

    // Simulate breakpoint = mobile (handset=true)
    (breakpointObserver.observe as jasmine.Spy).and.returnValue(of({ matches: true }));
    component.ngOnInit();

    expect(component.isMobile).toBeTrue();
    expect(sidenavCloseSpy).toHaveBeenCalled();
  });
});
