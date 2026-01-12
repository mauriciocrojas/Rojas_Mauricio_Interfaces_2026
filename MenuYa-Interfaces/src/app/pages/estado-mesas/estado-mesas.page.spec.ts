import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EstadoMesasPage } from './estado-mesas.page';

describe('EstadoMesasPage', () => {
  let component: EstadoMesasPage;
  let fixture: ComponentFixture<EstadoMesasPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EstadoMesasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
