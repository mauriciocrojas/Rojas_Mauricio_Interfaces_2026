import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import './app/oauth-deeplink';

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.log(err));
