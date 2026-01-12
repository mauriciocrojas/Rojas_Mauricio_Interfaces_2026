import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PostPagoPage } from './post-pago.page';

describe('PostPagoPage', () => {
  let component: PostPagoPage;
  let fixture: ComponentFixture<PostPagoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PostPagoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
