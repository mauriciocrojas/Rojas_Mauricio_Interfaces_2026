import { Component } from '@angular/core';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-splash-anim',
  templateUrl: './splash-anim.page.html',
  styleUrls: ['./splash-anim.page.scss'],
  standalone: false
})
export class SplashAnimPage {
  dots = Array.from({ length: 18 });
  private timer?: any;

  constructor(private nav: NavController) {}

  // mejor que ngOnInit: se dispara cuando la vista ya es visible
  ionViewDidEnter() {
    this.timer = setTimeout(() => this.nav.navigateRoot('/login'), 3000);
  }

  ionViewWillLeave() {
    if (this.timer) clearTimeout(this.timer);
  }
}
