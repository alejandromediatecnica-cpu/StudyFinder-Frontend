import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService, AuthUser } from '../../../services/auth.service';

interface TeamMember {
  initials: string;
  name: string;
  role: string;
  quote: string;
  accent: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css'
})
export class LandingComponent implements OnInit {
  user = signal<AuthUser | null>(null);
  accountMenuOpen = signal(false);
  readonly team: TeamMember[] = [
    {
      initials: 'AQ',
      name: 'Alejandro Quintero',
      role: 'Full Stack',
      quote: 'Arquitectura, integración y experiencia unificada.',
      accent: 'cyan'
    },
    {
      initials: 'MV',
      name: 'Matias Valencia',
      role: 'Backend',
      quote: 'Seguridad, lógica de negocio y APIs robustas.',
      accent: 'blue'
    },
    {
      initials: 'SM',
      name: 'Samuel Muñoz',
      role: 'Backend',
      quote: 'Persistencia, validaciones y fiabilidad del sistema.',
      accent: 'violet'
    },
    {
      initials: 'SME',
      name: 'Sebastian Melendez',
      role: 'Base de datos',
      quote: 'Modelado, integridad y optimización de datos.',
      accent: 'green'
    }
  ];

  activeProfile = 0;

  constructor(private authService: AuthService, private router: Router) {
    this.user.set(this.authService.getUser());
  }

  ngOnInit(): void {
    // Eliminar cualquier vestigio de "El colegio" si existiera en el DOM.
  }

  get activeStudent(): TeamMember {
    return this.team[this.activeProfile];
  }

  selectProfile(index: number): void {
    this.activeProfile = index;
  }

  previousProfile(): void {
    this.activeProfile = (this.activeProfile + this.team.length - 1) % this.team.length;
  }

  nextProfile(): void {
    this.activeProfile = (this.activeProfile + 1) % this.team.length;
  }

  toggleAccountMenu(): void {
    this.accountMenuOpen.update(open => !open);
  }

  logout(): void {
    this.authService.logout();
    this.user.set(null);
    this.accountMenuOpen.set(false);
    this.router.navigate(['/']);
  }

  scrollToTeam(): void {
    const element = document.getElementById('equipo');
    element?.scrollIntoView({ behavior: 'smooth' });
  }
}
