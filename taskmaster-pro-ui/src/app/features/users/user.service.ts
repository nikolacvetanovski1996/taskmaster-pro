import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, finalize, shareReplay, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { UserDto } from '../../shared/models/user.dto';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly apiUrl = `${environment.apiBaseUrl}/Users`;

  // Cache for exists checks
  private existsCache = new Map<string, { val: boolean; expires: number }>();
  private existsInFlight = new Map<string, Observable<boolean>>();

  constructor(private http: HttpClient) {}

  getById(id: string): Observable<UserDto> {
    return this.http.get<UserDto>(`${this.apiUrl}/${id}`);
  }

  searchUsers(query: string): Observable<UserDto[]> {
    if (!query || query.trim().length < 3) return of([]); // avoid empty or too-short searches

    const q = encodeURIComponent(query.trim());
    return this.http.get<UserDto[]>(`${this.apiUrl}/search?query=${q}`)
      .pipe(
        catchError(() => of([]))
      );
  }

  exists(id: string): Observable<boolean> {
    if (!id) return of(false);
    return this.http.get<boolean>(`${this.apiUrl}/${id}/exists`).pipe(
      catchError(() => of(false))
    );
  }

  existsCached(id: string): Observable<boolean> {
    const now = Date.now();
    const cached = this.existsCache.get(id);
    if (cached && cached.expires > now) {
      return of(cached.val);
    }

    if (this.existsInFlight.has(id)) {
      return this.existsInFlight.get(id)!;
    }

    const obs$ = this.http.get<boolean>(`${this.apiUrl}/${id}/exists`).pipe(
      catchError(() => of(false)),
      tap(v => this.existsCache.set(id, { val: v, expires: Date.now() + 60_000 })), // 60s TTL
      finalize(() => this.existsInFlight.delete(id)),
      shareReplay(1)
    );

    this.existsInFlight.set(id, obs$);
    return obs$;
  }
}