import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/auth.service';
import { ClientesService } from 'src/app/clientes.service';
import { MesaService } from 'src/app/services/mesas';
import { SpinnerService } from 'src/app/services/spinner';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartData, ChartOptions, ChartType, registerables } from 'chart.js';
import { EncuestasService, EncuestaRatings, Estadisticas, Distribucion } from 'src/app/services/encuestas.service';

Chart.register(...registerables);

type ChartSlideKey = keyof Pick<Estadisticas, 'servicio' | 'comida' | 'precio_calidad' | 'experiencia'>;
type ChartSlideConfig = {
  key: ChartSlideKey;
  title: string;
  chartType: ChartType;
  chartData: ChartData<any>;
  chartOptions: ChartOptions<any>;
};

@Component({
  selector: 'app-encuestas',
  templateUrl: './encuestas.page.html',
  styleUrls: ['./encuestas.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ReactiveFormsModule, FormsModule, BaseChartDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class EncuestasPage implements OnInit {
  form!: FormGroup;
  isLoading = false;
  canSubmit = false;
  yaRespondio = false;
  enEspera = false;
  segment: 'form' | 'resultados' = 'form';
  soloResultados = false;

  clienteId: string | number | null = null;
  mesaId: number | null = null;
  origenDelivery = false;
  private readonly DELIVERY_MESA_ID = 9999;

  estadisticas: Estadisticas | null = null;

  @ViewChildren(BaseChartDirective) charts?: QueryList<BaseChartDirective>;

  readonly ratingKeys: (1|2|3|4|5)[] = [1, 2, 3, 4, 5];
  readonly satisfactionScale: { value: 1|2|3|4|5; label: string; helper: string }[] = [
    { value: 1, label: 'Muy mala', helper: 'Completamente insatisfecho' },
    { value: 2, label: 'Mala', helper: 'Debajo de lo esperado' },
    { value: 3, label: 'Regular', helper: 'Aceptable con puntos a mejorar' },
    { value: 4, label: 'Buena', helper: 'Cumplio con lo prometido' },
    { value: 5, label: 'Excelente', helper: 'Supero todas las expectativas' },
  ];
  readonly ratingLabels: string[] = this.satisfactionScale.map(option => `${option.value} - ${option.label}`);
  readonly chartPalette: string[] = ['#ef5350', '#ffa726', '#42a5f5', '#26a69a', '#7e57c2'];

  comidaChartData: ChartData<'pie', number[], string> = {
    labels: this.ratingLabels,
    datasets: [
      {
        data: [0, 0, 0, 0, 0],
        backgroundColor: this.chartPalette,
        borderWidth: 1,
      },
    ],
  };
  comidaChartOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { color: '#ffffffff', usePointStyle: true, font: { size: 15 } },
      },
    },
  };

  servicioChartData: ChartData<'bar', number[], string> = {
    labels: this.ratingLabels,
    datasets: [
      {
        data: [0, 0, 0, 0, 0],
        label: 'Votos',
        backgroundColor: '#4263eb',
        hoverBackgroundColor: '#4c74ff',
        borderRadius: 8,
        maxBarThickness: 40,
      },
    ],
  };
  servicioChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { display: true, color: 'rgba(0,0,0,0.05)' },
        ticks: { color: '#ffffffff', font: { size: 12 } },
      },
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, color: '#ffffffff' },
        grid: { color: 'rgba(0,0,0,0.08)' },
      },
    },
    plugins: {
      legend: { display: false },
    },
  };

  experienciaChartData: ChartData<'line', number[], string> = {
    labels: this.ratingLabels,
    datasets: [
      {
        data: [0, 0, 0, 0, 0],
        label: 'Respuestas',
        fill: false,
        borderColor: '#2dd36f',
        backgroundColor: 'rgba(45,211,111,0.22)',
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };
  experienciaChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: { color: '#ffffffff' },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, color: '#ffffffff' },
        grid: { color: 'rgba(0,0,0,0.08)' },
      },
    },
    plugins: {
      legend: { display: false },
    },
  };

  precioChartData: ChartData<'doughnut', number[], string> = {
    labels: this.ratingLabels,
    datasets: [
      {
        data: [0, 0, 0, 0, 0],
        backgroundColor: this.chartPalette,
        hoverOffset: 6,
      },
    ],
  };
  precioChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right',
        labels: { color: '#ffffffff', usePointStyle: true, font: { size: 15 } },
      },
    },
  };
  readonly chartSlides: ChartSlideConfig[] = [
    {
      key: 'comida',
      title: 'Calidad de la comida',
      chartType: 'pie',
      chartData: this.comidaChartData,
      chartOptions: this.comidaChartOptions,
    },
    {
      key: 'servicio',
      title: 'Atencion de los mozos',
      chartType: 'bar',
      chartData: this.servicioChartData,
      chartOptions: this.servicioChartOptions,
    },
    {
      key: 'experiencia',
      title: 'Experiencia',
      chartType: 'line',
      chartData: this.experienciaChartData,
      chartOptions: this.experienciaChartOptions,
    },
    {
      key: 'precio_calidad',
      title: 'Precio / Calidad',
      chartType: 'doughnut',
      chartData: this.precioChartData,
      chartOptions: this.precioChartOptions,
    },
  ];

  constructor(
    private fb: FormBuilder,
    private toast: ToastController,
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    private clientesSrv: ClientesService,
    private mesaSrv: MesaService,
    private encuestasSrv: EncuestasService,
    private spinner: SpinnerService,
  ) {}

  async ngOnInit() {
    this.form = this.fb.group({
      servicio: [3, [Validators.required]],
      comida: [3, [Validators.required]],
      precio_calidad: [3, [Validators.required]],
      experiencia: [3, [Validators.required]],
      comentario: ['']
    });

    await this.cargarContexto();
  }

  private async cargarContexto() {
    try {
      this.isLoading = true;
      const origenParam = this.route.snapshot.queryParamMap.get('origen');
      const soloResultadosParam = this.route.snapshot.queryParamMap.get('soloResultados');
      this.origenDelivery = origenParam === 'delivery';
      this.soloResultados = soloResultadosParam === '1' || soloResultadosParam === 'true';

      const email = await this.auth.getUserEmail();
      this.clienteId = await this.clientesSrv.getClienteIdByEmail(email);

      if (this.origenDelivery && this.clienteId) {
        this.mesaId = this.DELIVERY_MESA_ID;
        this.enEspera = false;
      } else if (this.clienteId) {
        this.mesaId = await this.mesaSrv.obtenerMesaCliente(this.clienteId);
        const enEsperaStatus = await this.mesaSrv.obtenerEnEspera(Number(this.clienteId));
        this.enEspera = enEsperaStatus === true;
      } else {
        this.mesaId = null;
        this.enEspera = false;
      }

      this.canSubmit = !!(this.clienteId && this.mesaId) && !this.enEspera && !this.soloResultados;

      if (this.clienteId && this.mesaId) {
        this.yaRespondio = await this.encuestasSrv.yaRespondioHoy(this.clienteId, this.mesaId);
      } else {
        this.yaRespondio = true; // si no hay mesa/cliente, bloquea envio
      }

      if (this.origenDelivery && this.clienteId && this.mesaId) {
        this.canSubmit = true;
        this.enEspera = false;
        this.soloResultados = false;
      }

      // Si ya respondio, mostrar directamente resultados
      this.segment = (this.yaRespondio || this.enEspera || this.soloResultados) ? 'resultados' : 'form';

      await this.cargarResultados();
    } finally {
      this.isLoading = false;
    }
  }

  async enviar() {
    if (!this.form.valid || !this.canSubmit || this.yaRespondio || this.enEspera || !this.clienteId || !this.mesaId) {
      return;
    }

    try {
      this.isLoading = true;
      const ratings: EncuestaRatings = {
        servicio: Number(this.form.value.servicio),
        comida: Number(this.form.value.comida),
        precio_calidad: Number(this.form.value.precio_calidad),
        experiencia: Number(this.form.value.experiencia),
      };

      await this.encuestasSrv.guardarEncuesta({
        cliente_id: this.clienteId,
        mesa_id: this.mesaId,
        ratings,
        comentario: this.form.value.comentario?.toString()?.trim() || null,
      });

      this.yaRespondio = true;
      this.segment = 'resultados';
      await this.toastMsg('Gracias por tu opinion!');
      await this.cargarResultados();
    } catch (e) {
      console.error(e);
      await this.toastMsg('No se pudo enviar la encuesta');
    } finally {
      this.isLoading = false;
    }
  }

  async cargarResultados(event?: CustomEvent) {
    // Mostrar resultados globales, todas las encuestas
    const rows = await this.encuestasSrv.obtenerEncuestas();
    this.estadisticas = this.encuestasSrv.calcularEstadisticas(rows);
    this.updateChartData();
    if (event?.target && typeof (event.target as any).complete === 'function') {
      (event.target as any).complete();
    }
  }

  setPrecioCalidad(value: 1|2|3|4|5) {
    this.form?.get('precio_calidad')?.setValue(value);
  }

  async goHome() {
    await this.spinner.show();
    try {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } finally {
      await this.spinner.hide();
    }
  }

  private async toastMsg(message: string) {
    const t = await this.toast.create({ message, duration: 1600, color: 'primary' });
    await t.present();
  }

  private distribucionToArray(dist?: Distribucion | null): number[] {
    return this.ratingKeys.map(key => dist?.[key] ?? 0);
  }

  private updateChartData(): void {
    const stats = this.estadisticas;
    if (!stats) {
      this.refreshCharts();
      return;
    }

    this.comidaChartData.datasets[0].data = this.distribucionToArray(stats.comida);
    this.servicioChartData.datasets[0].data = this.distribucionToArray(stats.servicio);
    this.experienciaChartData.datasets[0].data = this.distribucionToArray(stats.experiencia);
    this.precioChartData.datasets[0].data = this.distribucionToArray(stats.precio_calidad);

    this.refreshCharts();
  }

  private refreshCharts(): void {
    setTimeout(() => this.charts?.forEach(chart => chart.update()), 0);
  }
}
