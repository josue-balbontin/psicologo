import {
  Component,
  OnInit,
  ViewChild,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DayPilot,
  DayPilotCalendarComponent,
  DayPilotMonthComponent,
  DayPilotNavigatorComponent,
  DayPilotModule,
} from '@daypilot/daypilot-lite-angular';
import { SupabaseService } from '../../services/supabase/supabase';
import { Reserva } from '../../models/reserva.model';
import { LoadingComponent } from '../loading/loading.component';
import { ErrorComponent } from '../error/error.component';
import { EditarReserva } from './editar-reserva/editar-reserva';

type CalendarView = 'Day' | 'Week' | 'Month';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DayPilotModule,
    LoadingComponent,
    ErrorComponent,
    EditarReserva,
  ],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
})
export class CalendarComponent implements OnInit {
  @ViewChild('dayPilotCalendar') calendar!: DayPilotCalendarComponent;
  @ViewChild('dayPilotMonth') monthCalendar!: DayPilotMonthComponent;
  @ViewChild('navigator') navigator!: DayPilotNavigatorComponent;

  currentView = signal<CalendarView>('Week');
  sidebarOpen = signal(true);
  showEventModal = signal(false);
  showEventDetail = signal(false);
  selectedDate = signal(DayPilot.Date.today());
  isLoading = signal(false);
  isSavingEvent = signal(false);
  errorMsg = signal<string | null>(null);
  modalError = signal<string | null>(null);
  showEditarReserva = signal(false);
  reservaParaEditar = signal<Reserva | null>(null);
  createSubmitAttempted = signal(false);

  readonly COLOR = '#3b82f6';

  newEvent = {
    title: '',
    descripcion: '',
    telefono: '',
    correo: '',
    pais: '',
    precio: '' as string | number | null,
    start: '',
    end: '',
  };
  selectedEvent: DayPilot.Event | null = null;

  navigatorConfig: DayPilot.NavigatorConfig = {
    showMonths: 1,
    skipMonths: 1,
    rowsPerMonth: 'Auto',
    onVisibleRangeChanged: (args) => {
      this.updateRange();
    },
    onTimeRangeSelected: (args) => {
      this.selectedDate.set(args.day);
      this.updateCalendarDate(args.day);
    },
  };

  calendarConfig: DayPilot.CalendarConfig = {
    viewType: 'Week',
    startDate: DayPilot.Date.today(),
    durationBarVisible: true,
    cellHeight: 50,
    headerDateFormat: 'dddd d',
    timeFormat: 'Clock12Hours',
    businessBeginsHour: 8,
    businessEndsHour: 18,
    eventMoveHandling: 'Update',
    eventResizeHandling: 'Update',
    onEventMoved: (args) => {
      this.updateEvent(args.e);
    },
    onEventResized: (args) => {
      this.updateEvent(args.e);
    },
    onTimeRangeSelected: (args) => {
      this.openNewEventModal(args.start.toString(), args.end.toString());
      this.calendar?.control?.clearSelection();
    },
    onEventClick: (args) => {
      this.selectedEvent = args.e;
      this.showEventDetail.set(true);
    },
    onBeforeEventRender: (args) => {
      const color = (args.data as any)['color'] || '#3b82f6';
      args.data.backColor = color;
      args.data.borderColor = color;
      args.data.fontColor = '#ffffff';
      args.data.barColor = this.darkenColor(color, 20);
    },
  };

  monthConfig: DayPilot.MonthConfig = {
    startDate: DayPilot.Date.today(),
    eventHeight: 25,
    onTimeRangeSelected: (args) => {
      this.openNewEventModal(args.start.toString(), args.end.toString());
      this.monthCalendar?.control?.clearSelection();
    },
    onEventClick: (args) => {
      this.selectedEvent = args.e;
      this.showEventDetail.set(true);
    },
    onBeforeEventRender: (args) => {
      const color = (args.data as any)['color'] || '#3b82f6';
      args.data.backColor = color;
      args.data.borderColor = color;
      args.data.fontColor = '#ffffff';
    },
  };

  private supabaseService = inject(SupabaseService);

  private events: DayPilot.EventData[] = [];

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.cargarReservas();
  }

  get currentViewLabel(): string {
    const view = this.currentView();
    if (view === 'Day') return 'Día';
    if (view === 'Week') return 'Semana';
    return 'Mes';
  }

  get headerTitle(): string {
    const date = this.selectedDate();
    const view = this.currentView();
    const d = new Date(date.toString());

    if (view === 'Month') {
      return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    }
    if (view === 'Day') {
      return d.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    // Week: show range
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const startStr = startOfWeek.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    });
    const endStr = endOfWeek.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${startStr} - ${endStr}`;
  }

  switchView(view: CalendarView): void {
    this.currentView.set(view);
    if (view !== 'Month') {
      this.calendarConfig = {
        ...this.calendarConfig,
        viewType: view,
        startDate: this.selectedDate(),
        events: this.events,
      };
    } else {
      this.monthConfig = {
        ...this.monthConfig,
        startDate: this.selectedDate(),
        events: this.events,
      };
    }
    // Wait one tick so *ngIf creates the component and ViewChild is ready
    setTimeout(() => {
      if (view !== 'Month' && this.calendar?.control) {
        this.calendar.control.update({ viewType: view, startDate: this.selectedDate(), events: this.events });
      } else if (view === 'Month' && this.monthCalendar?.control) {
        this.monthCalendar.control.update({ startDate: this.selectedDate(), events: this.events });
      }
    }, 0);
  }

  goToday(): void {
    const today = DayPilot.Date.today();
    this.selectedDate.set(today);
    this.updateCalendarDate(today);
  }

  navigate(direction: number): void {
    const date = this.selectedDate();
    const view = this.currentView();
    let newDate: DayPilot.Date;

    if (view === 'Day') newDate = date.addDays(direction);
    else if (view === 'Week') newDate = date.addDays(7 * direction);
    else newDate = date.addMonths(direction);

    this.selectedDate.set(newDate);
    this.updateCalendarDate(newDate);
  }

  updateCalendarDate(date: DayPilot.Date): void {
    const view = this.currentView();
    if (view !== 'Month') {
      this.calendarConfig = { ...this.calendarConfig, startDate: date };
    } else {
      this.monthConfig = { ...this.monthConfig, startDate: date };
    }
  }

  updateRange(): void {}

  private hasOverlap(start: string, end: string, excludeId?: string): boolean {
    return this.events.some((ev) => {
      if (excludeId && String(ev.id) === excludeId) return false;
      const evStart = String(ev.start);
      const evEnd = String(ev.end);
      return start < evEnd && end > evStart;
    });
  }

  private formatTimeForDb(datetimeLocal: string): string {
    const time = datetimeLocal.split('T')[1] || '';
    if (time.length === 5) {
      return `${time}:00`;
    }
    return time.substring(0, 8);
  }

  private parsePrecio(value: string | number | null): number | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : NaN;
    }

    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  isCreateFieldInvalid(field: 'title' | 'descripcion' | 'telefono'): boolean {
    if (!this.createSubmitAttempted()) return false;

    if (field === 'title') return !this.newEvent.title.trim();
    if (field === 'descripcion') return !this.newEvent.descripcion.trim();
    return !this.newEvent.telefono.trim();
  }

  openNewEventModal(start: string = '', end: string = ''): void {
    const fmt = (s: string) => (s ? s.substring(0, 16) : '');
    if (!start) {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const h = now.getHours().toString().padStart(2, '0');
      const d = now.toISOString().substring(0, 10);
      start = `${d}T${h}:00`;
      end = `${d}T${(now.getHours() + 1).toString().padStart(2, '0')}:00`;
    }
    this.newEvent = {
      title: '',
      descripcion: '',
      telefono: '',
      correo: '',
      pais: '',
      precio: '',
      start: fmt(start),
      end: fmt(end),
    };
    this.createSubmitAttempted.set(false);
    this.modalError.set(null);
    this.showEventModal.set(true);
  }

  async saveEvent(): Promise<void> {
    if (this.isSavingEvent()) return;

    this.createSubmitAttempted.set(true);
    this.modalError.set(null);

    if (!this.newEvent.title.trim() || !this.newEvent.descripcion.trim() || !this.newEvent.telefono.trim()) {
      this.modalError.set('Título, descripción y teléfono son obligatorios.');
      return;
    }

    const phoneDigits = this.newEvent.telefono.replace(/\D/g, '');
    if (phoneDigits.length < 7) {
      this.modalError.set('El teléfono debe tener al menos 7 dígitos.');
      return;
    }

    const precio = this.parsePrecio(this.newEvent.precio);
    if (Number.isNaN(precio)) {
      this.modalError.set('El precio debe ser un número válido.');
      return;
    }

    if (this.newEvent.end <= this.newEvent.start) {
      this.modalError.set('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    if (this.hasOverlap(this.newEvent.start, this.newEvent.end)) {
      this.modalError.set('El horario se superpone con una reserva existente.');
      return;
    }

    const startDate = new Date(this.newEvent.start);
    const endDate = new Date(this.newEvent.end);
    const dia = startDate.toISOString().substring(0, 10);
    const horaInicio = this.formatTimeForDb(this.newEvent.start);
    const horaFinal = this.formatTimeForDb(this.newEvent.end);

    this.isSavingEvent.set(true);
    this.isLoading.set(true);
    this.errorMsg.set(null);
    try {
      const haySuperposicion = await this.supabaseService.existeSuperposicion(
        dia,
        horaInicio,
        horaFinal
      );
      if (haySuperposicion) {
        this.modalError.set('El horario se superpone con una reserva existente.');
        return;
      }

      const reserva: Omit<Reserva, 'id'> = {
        nombre: this.newEvent.title.trim(),
        descripcion: this.newEvent.descripcion.trim(),
        telefono: this.newEvent.telefono.trim(),
        correo: this.newEvent.correo.trim(),
        pais: this.newEvent.pais.trim(),
        precio,
        dia,
        hora_inicio: horaInicio,
        hora_final: horaFinal,
      };

      await this.supabaseService.guardar(reserva);
      await this.cargarReservas();
      this.showEventModal.set(false);
      this.createSubmitAttempted.set(false);
    } catch (err) {
      console.error('Error al guardar reserva:', err);
      this.errorMsg.set('No se pudo guardar la reserva.');
    } finally {
      this.isSavingEvent.set(false);
      this.isLoading.set(false);
    }
  }

  async deleteSelectedEvent(): Promise<void> {
    if (!this.selectedEvent) return;
    const id = Number(this.selectedEvent.id());

    this.isLoading.set(true);
    this.errorMsg.set(null);
    try {
      await this.supabaseService.eliminar(id);
      await this.cargarReservas();
      this.showEventDetail.set(false);
      this.selectedEvent = null;
    } catch (err) {
      console.error('Error al eliminar reserva:', err);
      this.errorMsg.set('No se pudo eliminar la reserva.');
    } finally {
      this.isLoading.set(false);
    }
  }

  loadEvents(): void {
    if (this.calendar?.control) {
      this.calendar.control.update({ events: this.events });
    }
    if (this.monthCalendar?.control) {
      this.monthCalendar.control.update({ events: this.events });
    }
    this.calendarConfig = { ...this.calendarConfig, events: this.events };
    this.monthConfig = { ...this.monthConfig, events: this.events };
  }

  async cargarReservas(): Promise<void> {
    this.isLoading.set(true);
    this.errorMsg.set(null);
    try {
      const reservas = await this.supabaseService.cargar();
      this.events = reservas.map((r) => this.reservaToEvent(r));
      this.loadEvents();
    } catch (err) {
      console.error('Error al cargar reservas:', err);
      this.errorMsg.set('No se pudieron cargar las reservas.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateEvent(e: DayPilot.Event): Promise<void> {
    const id = Number(e.id());
    const start = new Date(e.start().toString());
    const end = new Date(e.end().toString());

    // Check overlap before applying (exclude the event being moved)
    const newStart = e.start().toString();
    const newEnd = e.end().toString();
    if (this.hasOverlap(newStart, newEnd, String(id))) {
      this.errorMsg.set('No se puede mover: el horario se superpone con una reserva existente.');
      await this.cargarReservas(); // revert to original positions
      return;
    }

    // Update local array immediately so the event stays visible
    const idx = this.events.findIndex((ev) => ev.id === String(id));
    if (idx >= 0) {
      this.events[idx] = {
        ...this.events[idx],
        start: newStart,
        end: newEnd,
      };
      this.loadEvents();
    }

    this.errorMsg.set(null);
    try {
      await this.supabaseService.actualizar(id, {
        dia: start.toISOString().substring(0, 10),
        hora_inicio: start.toTimeString().substring(0, 8),
        hora_final: end.toTimeString().substring(0, 8),
      });
    } catch (err) {
      console.error('Error al actualizar reserva:', err);
      this.errorMsg.set('No se pudo mover la reserva.');
      // Revert by reloading from server
      await this.cargarReservas();
    }
  }

  openEditarReserva(): void {
    if (!this.selectedEvent) return;
    const reserva = (this.selectedEvent.data as any)['tags']?.reserva as Reserva | undefined;
    if (!reserva) return;
    this.reservaParaEditar.set({ ...reserva });
    this.showEventDetail.set(false);
    this.showEditarReserva.set(true);
  }

  async onReservaGuardada(reservaActualizada: Reserva): Promise<void> {
    this.showEditarReserva.set(false);
    this.reservaParaEditar.set(null);
    await this.cargarReservas();
  }

  onEditarCancelado(): void {
    this.showEditarReserva.set(false);
    this.reservaParaEditar.set(null);
  }

  private reservaToEvent(r: Reserva): DayPilot.EventData {
    const descripcion = r.descripcion || '';
    const precio = r.precio ?? null;
    return {
      id: String(r.id),
      text: r.nombre,
      html: this.buildEventPreviewHtml(r.nombre, descripcion, precio),
      start: `${r.dia}T${r.hora_inicio}`,
      end: `${r.dia}T${r.hora_final}`,
      backColor: this.COLOR,
      borderColor: this.COLOR,
      fontColor: '#ffffff',
      tags: { reserva: r },
    } as DayPilot.EventData;
  }

  private buildEventPreviewHtml(titulo: string, descripcion: string, precio: number | null): string {
    const safeTitle = this.escapeHtml(titulo || 'Sin título');
    const safeDescription = this.escapeHtml(descripcion || '');
    const safePrice = precio === null ? '' : this.escapeHtml(`$${precio.toFixed(2)}`);

    return `
      <div class="preview-event-title">${safeTitle}</div>
      <div class="preview-event-description">${safeDescription}</div>
      <div class="preview-event-price">${safePrice}</div>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Convierte '2026-03-06T09:00:00' → '06/03/2026 09:00' */
  formatDpDate(dpStr: string): string {
    // DayPilot devuelve 'YYYY-MM-DDTHH:mm:ss'
    const [datePart, timePart] = dpStr.split('T');
    if (!datePart) return dpStr;
    const [y, m, d] = datePart.split('-');
    const time = timePart ? timePart.substring(0, 5) : '';
    return `${d}/${m}/${y} ${time}`;
  }

  formatDuration(startStr: string, endStr: string): string {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffMs = end.getTime() - start.getTime();

    if (Number.isNaN(diffMs) || diffMs <= 0) {
      return 'No disponible';
    }

    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} h`;
    return `${hours} h ${minutes} min`;
  }

  private darkenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
}
