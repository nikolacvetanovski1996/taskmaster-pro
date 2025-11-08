import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DialogService } from '../../../shared/services/dialog.service';
import { MaterialModule } from '../../../shared/modules/material.module';
import { ExportService } from '../../../shared/services/export.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { ConfirmDialogData  } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ScheduleService } from '../../../core/services/schedule.service';
import { AuthService } from '../../authentication/services/auth.service';
import { ExportScheduleRow } from '../../../shared/models/export-schedule-row';
import { PagedSchedulesQuery, PagedSchedulesViewModel } from '../../../shared/models/paged-schedules';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { Inject } from '@angular/core';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../../shared/config/pagination-config';

@Component({
  selector: 'app-schedules',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule
  ],
  templateUrl: './list-schedules.component.html',
  styleUrls: ['./list-schedules.component.scss']
})
export class ListSchedulesComponent implements OnInit {
  displayedColumns = [
    'id',
    'orderId',
    'title',
    'scheduledStart',
    'scheduledEnd',
    'assignedTo',
    'description',
    'actions'
  ];
  schedules: PagedSchedulesViewModel[] = [];
  isLoading = false;

  // Paging and sorting
  pageSize = 10;
  pageIndex = 0;
  totalRecords = 0;
  draw = 1;

  // Sorting defaults
  sortColumn = -1;
  sortDirection: 'asc' | 'desc' | '' = '';

  // Map internal field names to user-friendly headers
  headerMap: Record<string, string> = {
    id: 'ID',
    orderId: 'Order ID',
    scheduledStart: 'Start',
    scheduledEnd: 'End',
    title: 'Title',
    description: 'Description',
    assignedTo: 'Assigned To',
    created: 'Created',
    createdBy: 'Created By',
    updated: 'Updated',
    updatedBy: 'Updated By'
  };

  // Editing/deleting permission / UI state
  currentUserId = '';
  currentUserIsAdmin = false;
  editingId: string | null = null;
  deletingId: string | null = null;

  constructor(
    private scheduleService: ScheduleService,
    private exportService: ExportService,
    private notification: NotificationService,
    private dialogService: DialogService,
    private router: Router,
    private authService: AuthService,
    @Inject(PAGE_SIZE_OPTIONS) public pageSizeOptions: number[]
  ) {
    this.pageSize = DEFAULT_PAGE_SIZE;
  }

  ngOnInit(): void {
    // Get basic current user info for permission checks
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.currentUserId = currentUser.id ?? '';
    }

    this.authService.isAdmin$.subscribe(isAdmin => {
      this.currentUserIsAdmin = isAdmin;

      this.loadPage();
    });
  }

  /** Loads the current page of schedules */
  loadPage(): void {
    this.isLoading = true;
    // Ensure page size is valid, default to 10 if not set
    const effectivePageSize = this.pageSize > 0 ? this.pageSize : 10;

    const query: PagedSchedulesQuery = {
      draw:   this.pageIndex + 1,
      start:  this.pageIndex * this.pageSize,
      length: effectivePageSize,
      order:  [{ column: this.sortColumn, dir: this.sortDirection }],
      columns: this.displayedColumns.map(col => ({
        data: col,
        name: '',
        orderable: true
      }))
    };

    this.scheduleService.getPaged(query).subscribe({
      next: res => {
          this.schedules = res.data.map(s => ({
          ...s,
          canDelete: !!(this.currentUserIsAdmin || s.createdBy === this.currentUserId),
          canEdit: !!(this.currentUserIsAdmin || s.createdBy === this.currentUserId)
        }));
        this.totalRecords = res.recordsTotal;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.notification.show('Failed to load schedules.', 'Close');
      }
    });
  }

  /** Hooks for page changes */
  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadPage();
  }

  /** Hooks for sort changes */
  onSortChange(sort: Sort) {
    if (!sort.direction) {
      this.sortColumn = -1;
      this.sortDirection = '';
    } else {
      this.sortColumn = this.displayedColumns.indexOf(sort.active);
      this.sortDirection = sort.direction as 'asc' | 'desc';
    }

    this.loadPage();
  }

  createSchedule(): void {
    this.router.navigate(['/schedules/create']);
  }

  canEdit(schedule: PagedSchedulesViewModel): boolean {
    return !!(
      schedule &&
      (this.currentUserIsAdmin || schedule.createdBy === this.currentUserId)
    );
  }

  editSchedule(id: string): void {
    this.router.navigate(['/schedules/edit', id]);
  }

  canDelete(schedule: PagedSchedulesViewModel): boolean {
    return !!(
      schedule &&
      (this.currentUserIsAdmin || schedule.createdBy === this.currentUserId)
    );
  }

  deleteSchedule(id: string): void {
    const schedule = this.schedules?.find(s => s.id === id);

    if (!schedule) {
      this.notification.show("Could not find schedule to delete.", 'Close');
      return;
    }

    if (!this.canDelete(schedule)) {
      this.notification.show("You don't have permission to delete this schedule.", 'Close');
      return;
    }
    
    const data: ConfirmDialogData = {
      title: 'Confirm Delete',
      message: 'Are you sure you want to delete this schedule?',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };

    this.dialogService.confirm(data).subscribe(confirmed => {
      if (confirmed) {
        this.deletingId = id;
        this.scheduleService.delete(id).subscribe({
          next: () => {
            this.deletingId = null;
            this.notification.show('Schedule deleted successfully.');
            this.loadPage();
          },
          error: () => {
            this.deletingId = null;
            this.notification.show('Could not delete schedule.', 'Close');
          }
        });
      }
    });
  }

  exportSchedulesExcel() {
    this.fetchAllSchedulesForExport(allSchedules => {
      this.exportService.exportToExcel(allSchedules, 'Schedules', this.headerMap);
    });
  }

  exportSchedulesCSV() {
    this.fetchAllSchedulesForExport(allSchedules => {
      this.exportService.exportToCSV(allSchedules, 'Schedules', this.headerMap);
    });
  }

  private fetchAllSchedulesForExport(callback: (schedules: ExportScheduleRow[]) => void) {
    if (this.totalRecords === 0) {
      this.notification.show('No schedules to export.', 'Close');
      return;
    }

    const query: PagedSchedulesQuery = {
      draw: 1,
      start: 0,
      length: this.totalRecords || 10000,
      order: [{ column: this.sortColumn, dir: this.sortDirection }],
      columns: this.displayedColumns.map(col => ({
        data: col,
        name: '',
        orderable: true
      }))
    };
    
    this.isLoading = true;
    this.scheduleService.getPaged(query).subscribe({
      next: res => {
        const mapped: ExportScheduleRow[] = res.data.map(s => ({
          id: s.id,
          orderId: s.orderId,
          scheduledStart: s.scheduledStart,
          scheduledEnd: s.scheduledEnd,
          title: s.title,
          description: s.description,
          assignedTo: s.assignedTo?.displayName ?? s.assignedTo?.id ?? '',
          created: s.created,
          createdBy: s.createdBy,
          updated: s.updated ?? '',
          updatedBy: s.updatedBy ?? ''
        }));

        callback(mapped);
        this.isLoading = false;
      },
      error: () => {
        this.notification.show('Failed to export schedules.', 'Close');
        this.isLoading = false;
      }
    });
  }
}
