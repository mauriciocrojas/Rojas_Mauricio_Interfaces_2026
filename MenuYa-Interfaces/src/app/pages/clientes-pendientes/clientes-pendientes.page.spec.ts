import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClientesPendientesPage } from './clientes-pendientes.page';

describe('ClientesPendientesPage', () => {
  let component: ClientesPendientesPage;
  let fixture: ComponentFixture<ClientesPendientesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ClientesPendientesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
