import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SplashAnimPage } from './splash-anim.page';

describe('SplashAnimPage', () => {
  let component: SplashAnimPage;
  let fixture: ComponentFixture<SplashAnimPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SplashAnimPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
