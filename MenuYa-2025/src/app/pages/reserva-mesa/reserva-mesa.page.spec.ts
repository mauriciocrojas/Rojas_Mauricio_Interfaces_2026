import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReservaMesaPage } from './reserva-mesa.page';

describe('ReservaMesaPage', () => {
  let component: ReservaMesaPage;
  let fixture: ComponentFixture<ReservaMesaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ReservaMesaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
