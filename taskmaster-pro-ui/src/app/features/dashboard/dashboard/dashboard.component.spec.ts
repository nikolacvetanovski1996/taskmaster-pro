import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardService } from '../services/dashboard.service';
import { NgChartsModule } from 'ng2-charts';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { dashboardStatsEmptyMock, dashboardStatsMock } from '../../../shared/mock-data';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let dashboardServiceSpy: jasmine.SpyObj<DashboardService>;

  beforeEach(async () => {
    const spy = jasmine.createSpyObj('DashboardService', ['getStats']);

    await TestBed.configureTestingModule({
      imports: [
        // standalone component + supporting modules
        DashboardComponent,
        NgChartsModule,
        MatCardModule,
        MatProgressSpinnerModule,
        BrowserAnimationsModule
      ],
      providers: [
        { provide: DashboardService, useValue: spy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    dashboardServiceSpy = TestBed.inject(DashboardService) as jasmine.SpyObj<DashboardService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('ngOnInit should build labels up to current month', () => {
    dashboardServiceSpy.getStats.and.returnValue(of(dashboardStatsEmptyMock));

    // act: triggers ngOnInit + loadDashboard
    fixture.detectChanges();

    // assert: barChartLabels are the full 12 months
    const now = new Date();
    expect(component.barChartLabels.length).toBe(12);
    expect(component.fullMonthLabels.length).toBe(12);
    expect(component.isLoading).toBeFalse(); // data finished loading
  });

  it('should populate totals and chart data on successful load', () => {
    dashboardServiceSpy.getStats.and.returnValue(of(dashboardStatsMock));

    // trigger lifecycle (ngOnInit -> loadDashboard)
    fixture.detectChanges();

    expect(component.isLoading).toBeFalse();
    expect(component.totalOrders).toBe(10);
    expect(component.totalSchedules).toBe(5);
    expect(component.totalUsers).toBe(3);

    // data arrays should match number of labels (set in ngOnInit)
    const months = component.barChartLabels.length;
    expect((component.barChartData.datasets[0].data as number[]).length).toBe(months);
    expect((component.barChartData.datasets[1].data as number[]).length).toBe(months);

    // check specific mapped values (Jan index 0, Feb index 1)
    expect((component.barChartData.datasets[0].data as number[])[0]).toBe(2); // orders Jan
    expect((component.barChartData.datasets[1].data as number[])[1]).toBe(3); // schedules Feb
  });

  it('should set isLoading false and keep zero totals on service error', () => {
    // make service fail
    dashboardServiceSpy.getStats.and.returnValue(throwError(() => ({ status: 500 })));

    // trigger lifecycle (ngOnInit -> loadDashboard)
    fixture.detectChanges();

    expect(component.isLoading).toBeFalse();
    expect(component.totalOrders).toBe(0);
    expect(component.totalSchedules).toBe(0);
    expect(component.totalUsers).toBe(0);
  });
});
