// ============================================================
// FLIP FLUID SIMULATION — FINAL
// Black Background Version
// ============================================================

// ---------------- Canvas & WebGL ----------------
const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl", { alpha: false, antialias: true }) || canvas.getContext("experimental-webgl");

// ---------------- Configuration ----------------
const container = document.getElementById("sim-container");

function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Physics World Dimensions
const simHeight = 3.0;
const cScale = canvas.height / simHeight;
const simWidth = canvas.width / cScale;

// Constants
const SOLID_CELL = 2;
const FLUID_CELL = 0;
const AIR_CELL = 1;

// ---------------- TYPES ----------------
const FLUID_TYPES = {
    WATER: { density: 1000, viscosity: 0.0, color: [0.2, 0.6, 1.0] },
    OIL:   { density: 800,  viscosity: 0.05, color: [0.9, 0.8, 0.2] },
    HONEY: { density: 1400, viscosity: 0.3,  color: [1.0, 0.6, 0.1] }
};

const OBSTACLE_TYPES = {
    STONE: { density: 3000, radius: 0.15, color: [0.5, 0.5, 0.55], restitution: 0.2 },
    LOG:   { density: 700,  radius: 0.18, color: [0.55, 0.35, 0.1], restitution: 0.4 },
    LEAF:  { density: 100,  radius: 0.12, color: [0.4, 0.8, 0.4], restitution: 0.1 }
};

// ---------------- Utility ----------------
function clamp(x, min, max) { return Math.min(Math.max(x, min), max); }

// ============================================================
// RIGID BODY CLASS (Obstacles)
// ============================================================
class RigidBody {
    constructor(x, y, typeKey) {
        const type = OBSTACLE_TYPES[typeKey];
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = type.radius;
        this.density = type.density;
        this.color = type.color;
        this.restitution = type.restitution;
        this.mass = Math.PI * this.radius * this.radius * this.density;
    }

    integrate(dt, gravity) {
        this.vy += gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // Damping
        this.vx *= 0.99;
        this.vy *= 0.99;
    }

    solveWallCollisions() {
        if (this.x < this.radius) { this.x = this.radius; this.vx *= -0.5; }
        if (this.x > simWidth - this.radius) { this.x = simWidth - this.radius; this.vx *= -0.5; }
        if (this.y < this.radius) { this.y = this.radius; this.vy *= -0.5; }
        if (this.y > simHeight - this.radius) { this.y = simHeight - this.radius; this.vy *= -0.5; }
    }
}

// ============================================================
// FLIP FLUID SOLVER
// ============================================================
class FlipFluid {
    constructor(density, width, height, spacing, particleRadius, maxParticles) {
        this.density = density;
        this.fNumX = Math.floor(width / spacing) + 1;
        this.fNumY = Math.floor(height / spacing) + 1;
        this.h = Math.max(width / this.fNumX, height / this.fNumY);
        this.fInvSpacing = 1.0 / this.h;
        this.fNumCells = this.fNumX * this.fNumY;

        this.u = new Float32Array(this.fNumCells);
        this.v = new Float32Array(this.fNumCells);
        this.du = new Float32Array(this.fNumCells);
        this.dv = new Float32Array(this.fNumCells);
        this.prevU = new Float32Array(this.fNumCells);
        this.prevV = new Float32Array(this.fNumCells);
        this.p = new Float32Array(this.fNumCells);
        this.s = new Float32Array(this.fNumCells);
        this.cellType = new Int32Array(this.fNumCells);

        this.maxParticles = maxParticles;
        this.particlePos = new Float32Array(2 * this.maxParticles);
        this.particleColor = new Float32Array(3 * this.maxParticles);
        this.particleVel = new Float32Array(2 * this.maxParticles);
        this.particleViscosity = new Float32Array(this.maxParticles);
        this.particleDensity = new Float32Array(this.fNumCells);
        this.particleRestDensity = 0.0;

        // Init colors
        for (let i = 0; i < this.maxParticles; i++) this.particleColor[3 * i + 2] = 1.0;

        this.particleRadius = particleRadius;
        this.pInvSpacing = 1.0 / (2.2 * particleRadius);
        this.pNumX = Math.floor(width * this.pInvSpacing) + 1;
        this.pNumY = Math.floor(height * this.pInvSpacing) + 1;
        this.pNumCells = this.pNumX * this.pNumY;

        this.numCellParticles = new Int32Array(this.pNumCells);
        this.firstCellParticle = new Int32Array(this.pNumCells + 1);
        this.cellParticleIds = new Int32Array(maxParticles);

        this.numParticles = 0;
        this.obstacles = [];
    }

    addObstacle(x, y, typeKey) {
        this.obstacles.push(new RigidBody(x, y, typeKey));
    }

    integrateParticles(dt, gravity) {
        for (let i = 0; i < this.numParticles; i++) {
            this.particleVel[2 * i + 1] += dt * gravity;
            this.particlePos[2 * i] += this.particleVel[2 * i] * dt;
            this.particlePos[2 * i + 1] += this.particleVel[2 * i + 1] * dt;
        }
    }

    updateObstacles(dt, gravity) {
        for (let obs of this.obstacles) {
            obs.integrate(dt, gravity);
            obs.solveWallCollisions();
        }

        // Obstacle-Obstacle Collisions
        for (let i = 0; i < this.obstacles.length; i++) {
            for (let j = i + 1; j < this.obstacles.length; j++) {
                const a = this.obstacles[i];
                const b = this.obstacles[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist2 = dx*dx + dy*dy;
                const minDist = a.radius + b.radius;

                if (dist2 < minDist * minDist) {
                    const dist = Math.sqrt(dist2);
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const pen = minDist - dist;
                    
                    const totalMass = a.mass + b.mass;
                    const aRatio = b.mass / totalMass;
                    const bRatio = a.mass / totalMass;

                    a.x -= nx * pen * aRatio;
                    a.y -= ny * pen * aRatio;
                    b.x += nx * pen * bRatio;
                    b.y += ny * pen * bRatio;

                    const relVx = b.vx - a.vx;
                    const relVy = b.vy - a.vy;
                    const vn = relVx * nx + relVy * ny;

                    if (vn < 0) {
                        const j = -(1 + Math.min(a.restitution, b.restitution)) * vn;
                        const impulse = j / (1/a.mass + 1/b.mass);
                        a.vx -= (impulse / a.mass) * nx;
                        a.vy -= (impulse / a.mass) * ny;
                        b.vx += (impulse / b.mass) * nx;
                        b.vy += (impulse / b.mass) * ny;
                    }
                }
            }
        }
    }

    pushParticlesApart(numIters) {
        const colorDiff = 0.001;
        this.numCellParticles.fill(0);

        for (let i = 0; i < this.numParticles; i++) {
            const x = this.particlePos[2 * i];
            const y = this.particlePos[2 * i + 1];
            const xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
            const yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
            this.numCellParticles[xi * this.pNumY + yi]++;
        }

        let first = 0;
        for (let i = 0; i < this.pNumCells; i++) {
            first += this.numCellParticles[i];
            this.firstCellParticle[i] = first;
        }
        this.firstCellParticle[this.pNumCells] = first;

        for (let i = 0; i < this.numParticles; i++) {
            const x = this.particlePos[2 * i];
            const y = this.particlePos[2 * i + 1];
            const xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
            const yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
            const cell = xi * this.pNumY + yi;
            this.firstCellParticle[cell]--;
            this.cellParticleIds[this.firstCellParticle[cell]] = i;
        }

        const minDist = 2.0 * this.particleRadius;
        const minDist2 = minDist * minDist;

        for (let iter = 0; iter < numIters; iter++) {
            for (let i = 0; i < this.numParticles; i++) {
                const px = this.particlePos[2 * i];
                const py = this.particlePos[2 * i + 1];
                const pxi = Math.floor(px * this.pInvSpacing);
                const pyi = Math.floor(py * this.pInvSpacing);
                
                for (let xi = pxi - 1; xi <= pxi + 1; xi++) {
                    for (let yi = pyi - 1; yi <= pyi + 1; yi++) {
                        if (xi < 0 || yi < 0 || xi >= this.pNumX || yi >= this.pNumY) continue;
                        const cell = xi * this.pNumY + yi;
                        const start = this.firstCellParticle[cell];
                        const end = this.firstCellParticle[cell + 1];
                        for (let j = start; j < end; j++) {
                            const id = this.cellParticleIds[j];
                            if (id === i) continue;
                            const dx = this.particlePos[2 * id] - px;
                            const dy = this.particlePos[2 * id + 1] - py;
                            const d2 = dx * dx + dy * dy;
                            if (d2 > minDist2 || d2 === 0.0) continue;
                            const d = Math.sqrt(d2);
                            const s = 0.5 * (minDist - d) / d;
                            this.particlePos[2 * i] -= dx * s;
                            this.particlePos[2 * i + 1] -= dy * s;
                            this.particlePos[2 * id] += dx * s;
                            this.particlePos[2 * id + 1] += dy * s;
                            
                            // Color diffusion
                            for (let k = 0; k < 3; k++) {
                                const c0 = this.particleColor[3 * i + k];
                                const c1 = this.particleColor[3 * id + k];
                                const val = (c0 + c1) * 0.5;
                                this.particleColor[3 * i + k] = c0 + (val - c0) * colorDiff;
                                this.particleColor[3 * id + k] = c1 + (val - c1) * colorDiff;
                            }
                        }
                    }
                }
            }
        }
    }

    handleCollisions() {
        const h = 1.0 / this.fInvSpacing;
        const r = this.particleRadius;
        const minX = h + r; const maxX = (this.fNumX - 1) * h - r;
        const minY = h + r; const maxY = (this.fNumY - 1) * h - r;

        for (let i = 0; i < this.numParticles; i++) {
            let x = this.particlePos[2 * i];
            let y = this.particlePos[2 * i + 1];

            // 1. Dynamic Obstacles
            for (let obs of this.obstacles) {
                const dx = x - obs.x;
                const dy = y - obs.y;
                const d2 = dx*dx + dy*dy;
                const radSum = obs.radius + r;

                if (d2 < radSum * radSum) {
                    const d = Math.sqrt(d2);
                    const nx = dx / d;
                    const ny = dy / d;
                    const pen = radSum - d;
                    x += nx * pen;
                    y += ny * pen;

                    const rVx = this.particleVel[2*i] - obs.vx;
                    const rVy = this.particleVel[2*i+1] - obs.vy;
                    const vn = rVx * nx + rVy * ny;

                    if (vn < 0) {
                        this.particleVel[2*i] -= nx * vn * 1.0;
                        this.particleVel[2*i+1] -= ny * vn * 1.0;
                        // Buoyancy/Drag push on obstacle
                        const forceMult = 0.05 * (this.density / obs.density); 
                        obs.vx += nx * vn * forceMult;
                        obs.vy += ny * vn * forceMult;
                    }
                }
            }

            // 2. Wall Collisions
            if (x < minX) { x = minX; this.particleVel[2 * i] = 0; }
            if (x > maxX) { x = maxX; this.particleVel[2 * i] = 0; }
            if (y < minY) { y = minY; this.particleVel[2 * i + 1] = 0; }
            if (y > maxY) { y = maxY; this.particleVel[2 * i + 1] = 0; }

            this.particlePos[2 * i] = x;
            this.particlePos[2 * i + 1] = y;
        }
    }

    updateParticleDensity() {
        const n = this.fNumY; const h = this.h; const h1 = this.fInvSpacing; const h2 = 0.5 * h;
        this.particleDensity.fill(0.0);

        for (let i = 0; i < this.numParticles; i++) {
            let x = this.particlePos[2 * i];
            let y = this.particlePos[2 * i + 1];
            x = clamp(x, h, (this.fNumX - 1) * h);
            y = clamp(y, h, (this.fNumY - 1) * h);
            const x0 = Math.floor((x - h2) * h1); const tx = ((x - h2) - x0 * h) * h1; const x1 = Math.min(x0 + 1, this.fNumX - 2);
            const y0 = Math.floor((y - h2) * h1); const ty = ((y - h2) - y0 * h) * h1; const y1 = Math.min(y0 + 1, this.fNumY - 2);
            const sx = 1.0 - tx; const sy = 1.0 - ty;

            if (x0 < this.fNumX && y0 < this.fNumY) this.particleDensity[x0 * n + y0] += sx * sy;
            if (x1 < this.fNumX && y0 < this.fNumY) this.particleDensity[x1 * n + y0] += tx * sy;
            if (x1 < this.fNumX && y1 < this.fNumY) this.particleDensity[x1 * n + y1] += tx * ty;
            if (x0 < this.fNumX && y1 < this.fNumY) this.particleDensity[x0 * n + y1] += sx * ty;
        }
        if (this.particleRestDensity === 0.0) {
            let sum = 0.0; let numFluidCells = 0;
            for (let i = 0; i < this.fNumCells; i++) {
                if (this.cellType[i] === FLUID_CELL) { sum += this.particleDensity[i]; numFluidCells++; }
            }
            if (numFluidCells > 0) this.particleRestDensity = sum / numFluidCells;
        }
    }

    transferVelocities(toGrid, flipRatio) {
        const n = this.fNumY; const h = this.h; const h1 = this.fInvSpacing; const h2 = 0.5 * h;

        if (toGrid) {
            this.prevU.set(this.u); this.prevV.set(this.v);
            this.du.fill(0.0); this.dv.fill(0.0);
            this.u.fill(0.0); this.v.fill(0.0);

            for (let i = 0; i < this.fNumCells; i++) this.cellType[i] = (this.s[i] === 0.0) ? SOLID_CELL : AIR_CELL;

            for (let i = 0; i < this.numParticles; i++) {
                const x = this.particlePos[2 * i]; const y = this.particlePos[2 * i + 1];
                const xi = clamp(Math.floor(x * h1), 0, this.fNumX - 1);
                const yi = clamp(Math.floor(y * h1), 0, this.fNumY - 1);
                const cellNr = xi * n + yi;
                if (this.cellType[cellNr] === AIR_CELL) this.cellType[cellNr] = FLUID_CELL;
            }
        }

        for (let component = 0; component < 2; component++) {
            const dx = component === 0 ? 0.0 : h2; const dy = component === 0 ? h2 : 0.0;
            const f = component === 0 ? this.u : this.v;
            const prevF = component === 0 ? this.prevU : this.prevV;
            const d = component === 0 ? this.du : this.dv;

            for (let i = 0; i < this.numParticles; i++) {
                let x = this.particlePos[2 * i]; let y = this.particlePos[2 * i + 1];
                x = clamp(x, h, (this.fNumX - 1) * h); y = clamp(y, h, (this.fNumY - 1) * h);
                const x0 = Math.min(Math.floor((x - dx) * h1), this.fNumX - 2); const tx = ((x - dx) - x0 * h) * h1; const x1 = Math.min(x0 + 1, this.fNumX - 2);
                const y0 = Math.min(Math.floor((y - dy) * h1), this.fNumY - 2); const ty = ((y - dy) - y0 * h) * h1; const y1 = Math.min(y0 + 1, this.fNumY - 2);
                const sx = 1.0 - tx; const sy = 1.0 - ty;
                const d0 = sx * sy; const d1 = tx * sy; const d2 = tx * ty; const d3 = sx * ty;
                const nr0 = x0 * n + y0; const nr1 = x1 * n + y0; const nr2 = x1 * n + y1; const nr3 = x0 * n + y1;

                if (toGrid) {
                    const pv = this.particleVel[2 * i + component];
                    f[nr0] += pv * d0; d[nr0] += d0; f[nr1] += pv * d1; d[nr1] += d1;
                    f[nr2] += pv * d2; d[nr2] += d2; f[nr3] += pv * d3; d[nr3] += d3;
                } else {
                    const offset = component === 0 ? n : 1;
                    const valid0 = this.cellType[nr0] !== AIR_CELL || this.cellType[nr0 - offset] !== AIR_CELL ? 1.0 : 0.0;
                    const valid1 = this.cellType[nr1] !== AIR_CELL || this.cellType[nr1 - offset] !== AIR_CELL ? 1.0 : 0.0;
                    const valid2 = this.cellType[nr2] !== AIR_CELL || this.cellType[nr2 - offset] !== AIR_CELL ? 1.0 : 0.0;
                    const valid3 = this.cellType[nr3] !== AIR_CELL || this.cellType[nr3 - offset] !== AIR_CELL ? 1.0 : 0.0;
                    const v = this.particleVel[2 * i + component];
                    const dSum = valid0 * d0 + valid1 * d1 + valid2 * d2 + valid3 * d3;

                    if (dSum > 0.0) {
                        const picV = (valid0 * d0 * f[nr0] + valid1 * d1 * f[nr1] + valid2 * d2 * f[nr2] + valid3 * d3 * f[nr3]) / dSum;
                        const corr = (valid0 * d0 * (f[nr0] - prevF[nr0]) + valid1 * d1 * (f[nr1] - prevF[nr1]) +
                                      valid2 * d2 * (f[nr2] - prevF[nr2]) + valid3 * d3 * (f[nr3] - prevF[nr3])) / dSum;
                        const flipV = v + corr;
                        const visc = this.particleViscosity[i];
                        let newVel = (1.0 - flipRatio) * picV + flipRatio * flipV;
                        if (visc > 0) newVel *= (1.0 - visc);
                        this.particleVel[2 * i + component] = newVel;
                    }
                }
            }
            if (toGrid) {
                for (let i = 0; i < f.length; i++) { if (d[i] > 0.0) f[i] /= d[i]; }
                for (let i = 0; i < this.fNumX; i++) {
                    for (let j = 0; j < this.fNumY; j++) {
                        const solid = this.cellType[i * n + j] === SOLID_CELL;
                        if (solid || (i > 0 && this.cellType[(i - 1) * n + j] === SOLID_CELL)) this.u[i * n + j] = this.prevU[i * n + j];
                        if (solid || (j > 0 && this.cellType[i * n + j - 1] === SOLID_CELL)) this.v[i * n + j] = this.prevV[i * n + j];
                    }
                }
            }
        }
    }

    solveIncompressibility(numIters, dt, overRelaxation, compensateDrift = true) {
        this.p.fill(0.0);
        this.prevU.set(this.u); this.prevV.set(this.v);
        const n = this.fNumY;
        const cp = this.density * this.h / dt;

        for (let iter = 0; iter < numIters; iter++) {
            for (let i = 1; i < this.fNumX - 1; i++) {
                for (let j = 1; j < this.fNumY - 1; j++) {
                    if (this.cellType[i * n + j] !== FLUID_CELL) continue;
                    const center = i * n + j;
                    const left = (i - 1) * n + j; const right = (i + 1) * n + j;
                    const bottom = i * n + j - 1; const top = i * n + j + 1;
                    const sx0 = this.s[left]; const sx1 = this.s[right];
                    const sy0 = this.s[bottom]; const sy1 = this.s[top];
                    const s = sx0 + sx1 + sy0 + sy1;
                    if (s === 0.0) continue;
                    let div = this.u[right] - this.u[center] + this.v[top] - this.v[center];
                    if (this.particleRestDensity > 0.0 && compensateDrift) {
                        const k = 1.0;
                        const compression = this.particleDensity[i * n + j] - this.particleRestDensity;
                        if (compression > 0.0) div = div - k * compression;
                    }
                    let p = -div / s * overRelaxation;
                    this.p[center] += cp * p;
                    this.u[center] -= this.s[left] * p; this.u[right] += this.s[right] * p;
                    this.v[center] -= this.s[bottom] * p; this.v[top] += this.s[top] * p;
                }
            }
        }
    }

    simulate(dt, gravity, flipRatio, numPressureIters, numParticleIters, overRelaxation, compensateDrift, separateParticles) {
        const numSubSteps = 1;
        const sdt = dt / numSubSteps;
        for (let step = 0; step < numSubSteps; step++) {
            this.updateObstacles(sdt, gravity);
            this.integrateParticles(sdt, gravity);
            if (separateParticles) this.pushParticlesApart(numParticleIters);
            this.handleCollisions();
            this.transferVelocities(true);
            this.updateParticleDensity();
            this.solveIncompressibility(numPressureIters, sdt, overRelaxation, compensateDrift);
            this.transferVelocities(false, flipRatio);
        }
    }

    removeParticles(x, y, radius) {
        const r2 = radius * radius;
        for (let i = 0; i < this.numParticles; i++) {
            const dx = this.particlePos[2 * i] - x;
            const dy = this.particlePos[2 * i + 1] - y;
            if (dx * dx + dy * dy < r2) {
                const last = this.numParticles - 1;
                this.particlePos[2 * i] = this.particlePos[2 * last];
                this.particlePos[2 * i + 1] = this.particlePos[2 * last + 1];
                this.particleVel[2 * i] = this.particleVel[2 * last];
                this.particleVel[2 * i + 1] = this.particleVel[2 * last + 1];
                this.particleColor[3 * i] = this.particleColor[3 * last];
                this.particleColor[3 * i + 1] = this.particleColor[3 * last + 1];
                this.particleColor[3 * i + 2] = this.particleColor[3 * last + 2];
                this.particleViscosity[i] = this.particleViscosity[last];
                this.numParticles--;
                i--;
            }
        }
    }
}

// ============================================================
// SCENE SETUP & SHADERS
// ============================================================
const scene = {
    gravity: -9.81,
    baseGravity: -9.81,
    dt: 1.0 / 120.0,
    flipRatio: 0.9,
    numPressureIters: 50,
    numParticleIters: 2,
    overRelaxation: 1.9,
    compensateDrift: true,
    separateParticles: true,
    paused: false,
    showParticles: true,
    fluid: null,
    mode: "inject",
    selectedFluid: "WATER",
    mouseX: 0,
    mouseY: 0,
    mouseDown: false
};

function setupScene() {
    const res = 80;
    const h = simHeight / res;
    scene.fluid = new FlipFluid(1000, simWidth, simHeight, h, 0.3 * h, 200000);
    // Walls
    const n = scene.fluid.fNumY;
    for (let i = 0; i < scene.fluid.fNumX; i++) {
        for (let j = 0; j < scene.fluid.fNumY; j++) {
            let s = 1.0;
            if (i === 0 || i === scene.fluid.fNumX - 1 || j === 0 || j === scene.fluid.fNumY - 1) 
                s = 0.0;
            scene.fluid.s[i * n + j] = s;
        }
    }
}

// Shaders
const pointVS = `attribute vec2 aPos; attribute vec3 aCol; uniform vec2 uDom; uniform float uSize; varying vec3 vCol;
void main() { gl_Position = vec4((aPos/uDom)*2.0-1.0, 0.0, 1.0); gl_PointSize = uSize; vCol = aCol; }`;
const pointFS = `precision mediump float; varying vec3 vCol;
void main() { if(length(gl_PointCoord-0.5)>0.5) discard; gl_FragColor = vec4(vCol, 1.0); }`;

const obstacleVS = `attribute vec2 aPos; uniform vec2 uDom; uniform float uSize;
void main() { gl_Position = vec4((aPos/uDom)*2.0-1.0, 0.0, 1.0); gl_PointSize = uSize; }`;
const obstacleFS = `precision mediump float; uniform vec3 uCol;
void main() { if(length(gl_PointCoord-0.5)>0.5) discard; gl_FragColor = vec4(uCol, 1.0); }`;

function createProgram(vs, fs) {
    const p = gl.createProgram();
    const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, vs); gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    return p;
}

let pProg, oProg;
let particleBuf, colorBuf, obsBuf;

function initGL() {
    pProg = createProgram(pointVS, pointFS);
    oProg = createProgram(obstacleVS, obstacleFS);
    particleBuf = gl.createBuffer();
    colorBuf = gl.createBuffer();
    obsBuf = gl.createBuffer();
}

function draw() {
    // ------------------------------------------------
    // CRITICAL FIX: CLEAR TO BLACK (0,0,0) NOT WHITE
    // ------------------------------------------------
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // 1. Draw Particles
    if (scene.fluid.numParticles > 0) {
        gl.useProgram(pProg);
        gl.uniform2f(gl.getUniformLocation(pProg, "uDom"), simWidth, simHeight);
        gl.uniform1f(gl.getUniformLocation(pProg, "uSize"), scene.fluid.particleRadius * 2.5 * (canvas.height/simHeight));
        
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
        gl.bufferData(gl.ARRAY_BUFFER, scene.fluid.particlePos.subarray(0, scene.fluid.numParticles*2), gl.DYNAMIC_DRAW);
        const pLoc = gl.getAttribLocation(pProg, "aPos");
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
        gl.bufferData(gl.ARRAY_BUFFER, scene.fluid.particleColor.subarray(0, scene.fluid.numParticles*3), gl.DYNAMIC_DRAW);
        const cLoc = gl.getAttribLocation(pProg, "aCol");
        gl.enableVertexAttribArray(cLoc);
        gl.vertexAttribPointer(cLoc, 3, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.POINTS, 0, scene.fluid.numParticles);
    }

    // 2. Draw Obstacles (Independent of particles)
    if (scene.fluid.obstacles.length > 0) {
        gl.useProgram(oProg);
        gl.uniform2f(gl.getUniformLocation(oProg, "uDom"), simWidth, simHeight);
        const opLoc = gl.getAttribLocation(oProg, "aPos");
        gl.bindBuffer(gl.ARRAY_BUFFER, obsBuf); // Reuse or own buffer
        gl.enableVertexAttribArray(opLoc);

        for (let obs of scene.fluid.obstacles) {
            gl.uniform1f(gl.getUniformLocation(oProg, "uSize"), obs.radius * 2.0 * (canvas.height/simHeight));
            gl.uniform3fv(gl.getUniformLocation(oProg, "uCol"), obs.color);
            // Re-upload single point
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([obs.x, obs.y]), gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(opLoc, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.POINTS, 0, 1);
        }
    }
}

// ============================================================
// UI & INTERACTION
// ============================================================
setupScene();
initGL();

// Toggles
const injectToggle = document.getElementById("injectToggle");
if (injectToggle) {
    injectToggle.addEventListener("change", e => {
        scene.mode = e.target.checked ? "inject" : "suck";
        const lbl = document.getElementById("mode-label");
        if(lbl) {
            lbl.innerText = scene.mode.toUpperCase();
            lbl.style.color = scene.mode === "inject" ? "#2563eb" : "#ef4444";
        }
    });
}

// Fluid Select
const fluidSelect = document.querySelector("select");
if (fluidSelect) {
    fluidSelect.addEventListener("change", e => scene.selectedFluid = e.target.value.toUpperCase());
}

// Gravity
const gravSlider = document.querySelector("input[type=range]");
if (gravSlider) {
    gravSlider.addEventListener("input", e => {
        const pct = parseInt(e.target.value);
        scene.gravity = scene.baseGravity * (pct / 100.0);
    });
}

// Add Obstacle
const obsBtn = document.querySelector(".section button:nth-of-type(1)");
if (obsBtn) {
    obsBtn.addEventListener("click", () => {
        const types = Object.keys(OBSTACLE_TYPES);
        const k = types[Math.floor(Math.random()*types.length)];
        scene.fluid.addObstacle(simWidth/2 + (Math.random()-0.5), simHeight - 0.5, k);
    });
}

// Clear
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        scene.fluid.numParticles = 0;
        scene.fluid.obstacles = [];
    });
}

// Mouse Tracking
function getSimCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / cScale;
    const y = (rect.height - (clientY - rect.top)) / cScale;
    return { x, y };
}

canvas.addEventListener("mousedown", e => {
    scene.mouseDown = true;
    const c = getSimCoords(e.clientX, e.clientY);
    scene.mouseX = c.x; scene.mouseY = c.y;
    interact(); // Instant interaction on click
});
canvas.addEventListener("mouseup", () => scene.mouseDown = false);
canvas.addEventListener("mouseleave", () => scene.mouseDown = false);
canvas.addEventListener("mousemove", e => {
    const c = getSimCoords(e.clientX, e.clientY);
    scene.mouseX = c.x; scene.mouseY = c.y;
});
canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    const c = getSimCoords(e.touches[0].clientX, e.touches[0].clientY);
    scene.mouseX = c.x; scene.mouseY = c.y;
}, {passive: false});
canvas.addEventListener("touchstart", e => {
    scene.mouseDown = true;
    const c = getSimCoords(e.touches[0].clientX, e.touches[0].clientY);
    scene.mouseX = c.x; scene.mouseY = c.y;
});
canvas.addEventListener("touchend", () => scene.mouseDown = false);

function interact() {
    const x = scene.mouseX; 
    const y = scene.mouseY;
    if (scene.mode === "inject") {
        const type = FLUID_TYPES[scene.selectedFluid];
        // Inject fewer particles per frame, but continuous
        for(let i=0; i<3; i++) {
            if(scene.fluid.numParticles >= scene.fluid.maxParticles) break;
            const id = scene.fluid.numParticles++;
            const a = Math.random() * 6.28; 
            const r = Math.random() * 0.1;
            scene.fluid.particlePos[2*id] = x + Math.cos(a)*r;
            scene.fluid.particlePos[2*id+1] = y + Math.sin(a)*r;
            scene.fluid.particleVel[2*id] = (Math.random()-0.5);
            scene.fluid.particleVel[2*id+1] = -1.5;
            
            // Jitter Color
            scene.fluid.particleColor[3*id] = type.color[0] + (Math.random()-0.5)*0.1;
            scene.fluid.particleColor[3*id+1] = type.color[1] + (Math.random()-0.5)*0.1;
            scene.fluid.particleColor[3*id+2] = type.color[2] + (Math.random()-0.5)*0.1;
            
            scene.fluid.particleViscosity[id] = type.viscosity;
        }
    } else {
        scene.fluid.removeParticles(x, y, 0.2);
    }
}

// Loop
function update() {
    if (scene.mouseDown) interact(); // Continuous interaction

    if (!scene.paused) {
        scene.fluid.simulate(scene.dt, scene.gravity, scene.flipRatio, scene.numPressureIters, scene.numParticleIters, scene.overRelaxation, scene.compensateDrift, scene.separateParticles);
    }
    draw();
    requestAnimationFrame(update);
}
update();