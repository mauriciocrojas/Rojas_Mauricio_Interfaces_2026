import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { MesaService } from '../../services/mesas';
import { AuthService } from '../../auth.service';
import { ReservasService } from '../../services/reservas.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-reserva-mesa',
  templateUrl: './reserva-mesa.page.html',
  styleUrls: ['./reserva-mesa.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule]
})
export class ReservaMesaPage implements OnInit {
  form!: FormGroup;
  horarios: { value: string; label: string }[] = [];
  minDate!: string; // mañana como fecha mínima
  submitted = false;

  constructor(private fb: FormBuilder, private router: Router, private mesaService: MesaService, private authService: AuthService, private toastController: ToastController, private reservasService: ReservasService, private pushNotificationService: PushNotificationService) {}

  ngOnInit() {
    // Calcula mañana en formato YYYY-MM-DD (hora local)
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.minDate = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;

    this.form = this.fb.group({
      fecha: [this.minDate, Validators.required],
      horario: [null, Validators.required],
      comensales: [2, [Validators.required, Validators.min(1), Validators.max(10)]]
    });

    for (let hour = 0; hour <= 24; hour++) {
      const value = `${hour.toString().padStart(2, '0')}:00`;
      const label = value; // 24h format for clarity
      this.horarios.push({ value, label });
    }
  }

  onSubmit() {
    this.submitted = true;
    if (this.form.invalid) return;
    // Aquí se podría emitir el evento o navegar; por ahora, solo log.
    // eslint-disable-next-line no-console
    this.reservasService.crearReserva({
      fecha_hora: new Date(`${this.form.value.fecha}T${this.form.value.horario}:00`),
      personas: this.form.value.comensales
    }).then(() => {
      return this.pushNotificationService.sendNotificationToRole({
        role: 'dueño',
        title: 'Nueva reserva',
        body: `Se ha realizado una nueva reserva para el ${this.form.value.fecha} a las ${this.form.value.horario}.`,
        data: { tipo: 'reserva_nueva' }
      });
    }).then(() => {
      this.toastController.create({
        message: 'Reserva creada con éxito.',
        duration: 2000,
        color: 'success',
        position: 'middle'
      }).then(toast => toast.present());
      this.form.reset({
        fecha: this.minDate,
        horario: null,
        comensales: 2
      });
      this.submitted = false;
      this.goHome();
    }).catch(error => {
      this.toastController.create({
        message: `Error al crear la reserva: ${error.message}`,
        duration: 3000,
        color: 'danger',
        position: 'middle'
      }).then(toast => toast.present());
    });
    // eslint-disable-next-line no-console
    console.log('Reserva enviada:', this.form.value);
  }

  goHome() {
    this.router.navigate(['/home']);
  }
}
