import { Pipe, PipeTransform } from '@angular/core';
import { ThemeService } from './theme.service';

@Pipe({ name: 'iconName', pure: false, standalone: false })
export class IconNamePipe implements PipeTransform {
  constructor(private theme: ThemeService) {}

  transform(baseName: string): string {
    // baseName: 'mail' | 'lock-closed' | 'flash' etc.
    const variant = this.theme.getIconVariant(); // 'outline' | 'sharp'
    return `${baseName}-${variant}`;
  }
}
