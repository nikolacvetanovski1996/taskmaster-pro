import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/modules/material.module';
import { AdminService } from '../services/admin.service';
import { ExportService } from '../../../shared/services/export.service';
import { NotificationService } from '../../../shared/services/notification.service';
import {
  ConfirmDialogComponent,
  ConfirmDialogData
} from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { UserDto } from '../../../shared/models/user.dto';
import { PagedUsersQuery } from '../models/paged-users-query';
import { Sort } from '@angular/material/sort';
import { PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { DialogService } from '../../../shared/services/dialog.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { minSelected } from '../../../shared/validators/min-selected.validator';
import { Inject } from '@angular/core';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../../shared/config/pagination-config';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule
  ],
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss']
})
export class UserListComponent implements OnInit {
  displayedColumns = ['id', 'email', 'fullName', 'role', 'actions'];
  users: UserDto[] = [];
  isLoading = false;
  roles = ['User', 'Admin'];
  roleControls: { [key: string]: FormControl<string[] | null> } = {};

  // Paging & sorting
  pageSize: number;
  pageIndex = 0;
  totalRecords = 0;
  sortColumn = -1;
  sortDirection: 'asc' | 'desc' | '' = ''; 

  // Map internal field names to user-friendly headers
  headerMap: Record<string, string> = {
    id: 'ID',
    email: 'Email',
    fullName: 'Full Name',
    roles: 'Roles'
  };

  constructor(
    private adminService: AdminService,
    private exportService: ExportService,
    private notification: NotificationService,
    private dialogService: DialogService,
    private router: Router,
    @Inject(PAGE_SIZE_OPTIONS) public pageSizeOptions: number[]
  ) {
    this.pageSize = DEFAULT_PAGE_SIZE;
  }

  ngOnInit(): void {
    this.loadPage();
  }

  private loadPage(): void {
    this.pageSize  = Math.max(1, this.pageSize ?? DEFAULT_PAGE_SIZE);
    this.pageIndex = Math.max(0, this.pageIndex);

    this.isLoading = true;

    // Which displayed columns are purely UI-only (no DB column)
    const uiOnly = new Set(['roles', 'actions', 'userEmail']);

    // Build columns array to send to server
    const columns = this.displayedColumns.map(col => {
      if (col === 'roles' || col === 'actions' || col === 'fullName') {
        return {
          data: col,
          name: col,
          orderable: !uiOnly.has(col)
        };
      }

      return {
        data: col,
        name: col,
        orderable: true
      };
    });
    
    // Build orderArray: DataTables expects `column` to be an index into the `columns` array.
    let orderArray: { column: number; dir: "" | "asc" | "desc" }[] = [];

    if (this.sortColumn >= 0) {
      const activeColIndex = this.sortColumn; // index in displayedColumns / columns array
      const dir = (this.sortDirection === 'asc' || this.sortDirection === 'desc')
        ? this.sortDirection
        : 'asc';

      // If the column is marked orderable, send it; otherwise skip and fallback
      if (columns[activeColIndex] && columns[activeColIndex].orderable) {
        orderArray = [{ column: activeColIndex, dir: dir as 'asc' | 'desc' }];
      } else {
        // fallback: try to order by email column (if present and orderable)
        const emailIndex = this.displayedColumns.indexOf('email');
        if (emailIndex >= 0 && columns[emailIndex].orderable) {
          orderArray = [{ column: emailIndex, dir: 'asc' }];
        } else {
          orderArray = [];
        }
      }
    } else {
      // default ordering: email asc if available and orderable
      const emailIndex = this.displayedColumns.indexOf('email');
      if (emailIndex >= 0 && columns[emailIndex].orderable) {
        orderArray = [{ column: emailIndex, dir: 'asc' }];
      } else {
        orderArray = [];
      }
    }

    const query: PagedUsersQuery = {
      draw: Math.max(1, this.pageIndex + 1),
      start: this.pageIndex * this.pageSize,
      length: Math.max(1, this.pageSize),
      order: orderArray,
      columns
    };

    console.debug('Sending paged users query', query);

    this.adminService.getPagedUsers(query).subscribe({
      next: res => {
        this.users = res.data ?? [];
        this.totalRecords = res.recordsTotal ?? 0;
        this.patchControls();
        this.isLoading = false;
      },
      error: () => {
        this.notification.show('Failed to load users.', 'Close');
        this.isLoading = false;
      }
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadPage();
  }

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

  viewUser(id: string): void {
    this.router.navigate(['/admin/users', id]);
  }

  onRoleSelection(userId: string, newRoles: string[] | null) {
    const ctrl = this.roleControls[userId];
    if (!ctrl)
      return;
    ctrl.markAsTouched();
    if (ctrl.invalid)
      return;
    if (newRoles)
      this.changeUserRoles(userId, { roles: newRoles });
  }
  
  changeUserRoles(userId: string, dto: { roles: string[] }) {
    this.adminService.changeUserRoles(userId, dto).subscribe({
      next: () => {
        this.notification.show('User roles updated successfully.');
        this.loadPage();
      },
      error: () => {
        this.notification.show('Failed to update user roles.', 'Close');
      }
    });
  }

  deleteUser(id: string): void {
    const data: ConfirmDialogData = {
      title: 'Confirm Delete',
      message: 'Are you sure you want to delete this user?',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };

     this.dialogService.open<ConfirmDialogData, boolean>(ConfirmDialogComponent, { data, width: '350px' })
      .subscribe((confirmed: boolean | undefined) => {
        if (!confirmed) return;

        this.adminService.deleteUser(id).subscribe({
          next: () => {
            this.notification.show('User deleted successfully.');
            this.loadPage();
          },
          error: () => {
            this.notification.show('Could not delete user.', 'Close');
          }
        });
      });
  }
  
  patchControls() {
    this.roleControls = {};

    this.users.forEach(u => {
      this.roleControls[u.id] = new FormControl<string[] | null>(u.roles ?? [], [minSelected(1)]);
    });
  }

  exportUsersExcel() {
    this.fetchAllUsersForExport(allUsers => {
      this.exportService.exportToExcel(this.formatUsersForExport(allUsers), 'Users', this.headerMap);
    });
  }

  exportUsersCSV() {
    this.fetchAllUsersForExport(allUsers => {
      this.exportService.exportToCSV(this.formatUsersForExport(allUsers), 'Users', this.headerMap);
    });
  }

  private fetchAllUsersForExport(callback: (users: Partial<UserDto>[]) => void) {
    this.isLoading = true;

    const query: PagedUsersQuery = {
      draw: 1,
      start: 0,
      length: this.totalRecords || 10000,
      order: this.sortColumn >= 0 ? [{ column: this.sortColumn, dir: this.sortDirection as 'asc' | 'desc' }] : [],
      columns: this.displayedColumns.map(col => ({
        data: col,
        name: col,
        orderable: true
      }))
    };

    this.adminService.getPagedUsers(query).subscribe({
      next: res => {
        const mapped: Partial<UserDto>[] = res.data.map(u => ({
          id: u.id,
          email: u.email,
          fullName: u.fullName ?? '',
          roles: u.roles ?? []
        }));
        callback(mapped);
        this.isLoading = false;
      },
      error: () => {
        this.notification.show('Failed to export users.', 'Close');
        this.isLoading = false;
      }
    });
  }
  
  private formatUsersForExport(users: Partial<UserDto>[]) {
    return users.map(u => ({ ...u, roles: (u.roles ?? []).join(', ') }));
  }
}