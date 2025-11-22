import { Component, OnInit, OnDestroy, ViewChild  } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatSidenav } from '@angular/material/sidenav';
import { 
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  NavigationEnd
} from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../features/authentication/services/auth.service';
import { MaterialModule } from '../../shared/modules/material.module';
import { MatExpansionModule } from '@angular/material/expansion';
import { Observable, Subject, takeUntil } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MaterialModule,
    MatExpansionModule
  ],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  // Sidenav state
  isSidenavOpen = false;
  isMobile = false;
  sidenavMode: 'side' | 'over' = 'side';
  
  // Observables for authentication and route state
  isLoggedIn$: Observable<boolean>;
  isAdminRoute$: Observable<boolean>;
  isAdmin = false;
  private destroy$ = new Subject<void>();
  
  constructor(
    private authService: AuthService,
    private router: Router,
    private breakpointObserver: BreakpointObserver
  ) {
    this.isSidenavOpen = false;
    this.isLoggedIn$ = this.authService.isLoggedIn$;
    this.isAdminRoute$ = this.router.events.pipe(
      startWith(null),
      filter(e => !e || e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/admin'))
    );
  }

  ngOnInit() {
    this.authService.isAdmin$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    // Responsive sidenav setup
    const isHandset = this.breakpointObserver.isMatched(Breakpoints.Handset);
    this.isMobile = isHandset;
    this.sidenavMode = this.isMobile ? 'over' : 'side';
    this.isSidenavOpen = !this.isMobile;
    this.breakpointObserver.observe([Breakpoints.Handset])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile = result.matches;
        this.sidenavMode = this.isMobile ? 'over' : 'side';
        this.isSidenavOpen = !this.isMobile;
        if (!this.isMobile) {
          this.sidenav?.open();
        } else {
          this.sidenav?.close();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToProfile() {
    this.router.navigate(['/profile']);
  }
  
  logout() {
    this.authService.logout();
    this.isSidenavOpen = false;
    this.sidenav?.close();
    this.router.navigate(['/login']);
  }

  toggleSidenav() {
    this.isSidenavOpen = !this.isSidenavOpen;
    if (this.isSidenavOpen) {
      this.sidenav?.open();
    } else {
      this.sidenav?.close();
    }
  }

  onMenuItemClick() {
    if (this.isMobile) {
      this.sidenav.close();
      this.isSidenavOpen = false;
    }
  }
}
  