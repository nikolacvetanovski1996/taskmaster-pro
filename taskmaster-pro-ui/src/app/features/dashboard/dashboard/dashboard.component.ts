import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardService } from '../services/dashboard.service';
import { DashboardStatsDto } from '../models/dashboard-stats.dto';
import { trigger, style, animate, transition, query, stagger } from '@angular/animations';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    NgChartsModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  animations: [
    trigger('staggerFadeIn', [
      transition(':enter', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(20px)' }),
          stagger(100, [
            animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  isLoading = true;
  totalOrders = 0;
  displayedOrders = 0;
  totalSchedules = 0;
  displayedSchedules = 0;
  totalUsers = 0;

  public barChartLabels: string[] = [];
  public ordersChartData: number[] = [];
  public schedulesChartData: number[] = [];
  public fullMonthLabels: string[] = [];

  // Chart.js config:
  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    scales: {
      x: {
        stacked: false,
        grid: { display: false },
        ticks: {
        // still show the short labels on axis (keeps chart compact)
          callback: (value, index) => this.barChartLabels[index] ?? ''
        }
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0 }
      }
    },
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          // show full month name + year in tooltip title
          title: (tooltipItems) => {
            const idx = tooltipItems[0].dataIndex;
            return this.fullMonthLabels[idx] ?? '';
          },
          // optionally format the tooltip body value
          label: (tooltipItem) => {
            return `${tooltipItem.dataset.label}: ${tooltipItem.formattedValue}`;
          }
        }
      }
    }
  } as ChartConfiguration['options'];
  public barChartType: ChartType = 'bar';

  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: []
  };

  private readonly ACCENT = '#007bff';

  constructor(private dashboardService: DashboardService) {}

  ngOnInit() {
    // Build labels up to the current month for initial loading UI
    const now = new Date();
    const currentYear = now.getFullYear();
    const lastMonth = 11; // zero-based index for December

    this.buildLabelsUpTo(lastMonth, currentYear);

    this.loadDashboard();
  }

  private buildLabelsUpTo(lastMonthIndex: number, year: number) {
    this.barChartLabels = [];
    this.fullMonthLabels = [];
    for (let m = 0; m <= lastMonthIndex; m++) {
      this.barChartLabels.push(new Date(year, m).toLocaleString('default', { month: 'short' }));
      this.fullMonthLabels.push(new Date(year, m).toLocaleString('default', { month: 'long', year: 'numeric' }));
    }
  }

  private loadDashboard(year?: number) {
    this.isLoading = true;

    this.dashboardService.getStats(year).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats: DashboardStatsDto) => {
          this.totalOrders = stats.totalOrders;
          this.totalSchedules = stats.totalSchedules;
          this.totalUsers = stats.totalUsers;

          const months = this.barChartLabels.length;
          const ordersData = new Array(months).fill(0);
          const schedulesData = new Array(months).fill(0);

          stats.monthlyOrders.forEach(m => ordersData[m.month - 1] = m.count);
          stats.monthlySchedules.forEach(m => schedulesData[m.month - 1] = m.count);
          
          // Assign chart data
          this.barChartData = {
            labels: this.barChartLabels,
            datasets: [
              {
                label: 'Orders per month',
                data: ordersData,
                backgroundColor: this.ACCENT,
                borderColor: this.ACCENT,
                borderWidth: 1
              },
              {
                label: 'Schedules per month',
                data: schedulesData,
                backgroundColor: this.hexToRgba(this.ACCENT, 0.36),
                borderColor: this.hexToRgba(this.ACCENT, 0.8),
                borderWidth: 1
              }
            ]
          };

          // Sum displayed months (Jan–Dec)
          this.displayedOrders = ordersData.reduce((a, b) => a + b, 0);
          this.displayedSchedules = schedulesData.reduce((a, b) => a + b, 0);

          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
  }

  private hexToRgba(hex: string, alpha = 1) {
    const cleaned = hex.replace('#','');
    const bigint = parseInt(cleaned, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
