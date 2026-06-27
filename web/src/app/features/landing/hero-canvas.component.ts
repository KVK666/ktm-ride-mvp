import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import * as THREE from 'three';

@Component({
  selector: 'app-hero-canvas',
  standalone: true,
  template: '<canvas #canvas aria-hidden="true"></canvas>',
  styles: [`
    :host, canvas { display: block; width: 100%; height: 100%; }
    canvas { outline: none; }
  `]
})
export class HeroCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;
  private readonly zone = inject(NgZone);
  private renderer?: THREE.WebGLRenderer;
  private frame = 0;
  private resize?: ResizeObserver;
  private reduceMotion = false;

  ngAfterViewInit() {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.zone.runOutsideAngular(() => this.initScene());
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.renderer?.dispose();
  }

  private initScene() {
    const canvas = this.canvas.nativeElement;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x080a0c, 6, 19);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 4.7, 10.2);
    camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));

    const route = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-5.6, 0.15, 2.2),
      new THREE.Vector3(-3.4, 0.2, -1.8),
      new THREE.Vector3(-1.1, 0.15, 0.8),
      new THREE.Vector3(0.9, 0.18, -2.4),
      new THREE.Vector3(3.0, 0.12, -0.4),
      new THREE.Vector3(5.2, 0.16, -2.8)
    ]);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(route, 180, 0.05, 12, false),
      new THREE.MeshBasicMaterial({ color: 0xc8ff5a })
    );
    scene.add(tube);

    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xc8ff5a })
    );
    scene.add(pulse);

    const grid = new THREE.GridHelper(16, 32, 0x232830, 0x181c22);
    grid.position.y = -0.02;
    scene.add(grid);

    const points = new THREE.BufferGeometry();
    const positions = new Float32Array(260 * 3);
    for (let index = 0; index < 260; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 17;
      positions[index * 3 + 1] = Math.random() * 3.6 + 0.5;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 13;
    }
    points.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(points, new THREE.PointsMaterial({ color: 0x67a7ff, size: 0.035, transparent: true, opacity: 0.5 })));

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 96),
      new THREE.MeshBasicMaterial({ color: 0xc8ff5a, transparent: true, opacity: 0.055 })
    );
    glow.rotation.x = -Math.PI / 2;
    scene.add(glow);

    const setSize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      this.renderer?.setSize(width, height, false);
    };
    this.resize = new ResizeObserver(setSize);
    this.resize.observe(canvas);
    setSize();

    const render = (time = 0) => {
      const t = this.reduceMotion ? 0.22 : (time * 0.00012) % 1;
      const point = route.getPointAt(t);
      pulse.position.copy(point);
      pulse.scale.setScalar(1 + Math.sin(time * 0.006) * 0.22);
      tube.rotation.y = Math.sin(time * 0.00032) * 0.08;
      grid.position.z = this.reduceMotion ? 0 : (time * 0.0007) % 1;
      this.renderer?.render(scene, camera);
      if (!this.reduceMotion) {
        this.frame = requestAnimationFrame(render);
      }
    };
    render();
  }
}
