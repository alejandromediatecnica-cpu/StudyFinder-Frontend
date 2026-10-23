import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  it('arranca siempre en tema oscuro', () => {
    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
  });

  it('aplica data-theme en el documento', () => {
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ignora cualquier preferencia clara guardada (solo existe tema oscuro)', () => {
    localStorage.setItem('studyfinder_theme', 'light');
    const otro = new ThemeService();
    expect(otro.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persiste siempre el valor oscuro', () => {
    expect(localStorage.getItem('studyfinder_theme')).toBe('dark');
  });
});
