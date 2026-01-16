import { Pipe, PipeTransform } from '@angular/core';
import { ThemeService } from './theme.service';

@Pipe({ name: 'iconName', pure: false, standalone: false })
export class IconNamePipe implements PipeTransform {
  constructor(private theme: ThemeService) {}

  transform(baseName: string): string {
    // baseName: 'mail' | 'lock-closed' | 'flash' etc.
    // IMPORTANTE: los "logo-*" (ej: logo-google) NO tienen sufijos outline/sharp.
    // Y si ya viene con sufijo, lo respetamos.

    if (!baseName) return baseName;
    if (baseName.startsWith('logo-')) return baseName;
    if (baseName.endsWith('-outline') || baseName.endsWith('-sharp') || baseName.endsWith('-filled')) {
      return baseName;
    }

    const variant = this.theme.getIconVariant(); // 'outline' | 'sharp'
    return `${baseName}-${variant}`;
  }
}
