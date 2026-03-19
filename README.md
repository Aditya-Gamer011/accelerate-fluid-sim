
---

# Accelerate-- Fluid Simulator

**Accelerate Fluid Simulator** is a high-performance, interactive fluid dynamics simulator built for Hack Club Accelerate, that runs natively in your web browser. Built with raw **WebGL** and **Vanilla JavaScript**, it uses a hybrid **FLIP (Fluid Implicit Particle)** solver to deliver realistic, real-time liquid physics.

This isn't just a visual toy-- it's a physics sandbox where different fluids (like honey and oil) interact with rigid bodies (like stones and wood) in a scientifically plausible way.

##Key Features

* **High-Performance Solver:** Simulates up to 150,000 particles at 60 FPS using a custom WebGL renderer.
* **Multi-Material Physics:**
* **Water:** Standard density and low viscosity.
* **Oil:** Lighter than water (floats) with medium viscosity.
* **Honey:** Heavy, high-viscosity fluid that coils and stacks.


* **Dynamic Obstacles:**
* Includes distinct Rigid Bodies: **Stones** (sink), **Logs** (float), and **Leaves** (rest on surface).
* Features two-way coupling: Fluids push objects, and objects displace fluids.


* **Interactive Controls:**
* **Inject Mode:** Paint fluid directly into the tank with your mouse.
* **Suction Mode:** Remove particles to clean up the canvas.
* **Variable Gravity:** A slider that lets you go from Zero G to Hyper-Gravity, or even **reverse gravity** entirely.


* **Sleek UI:** A polished, laboratory aesthetic with a minimal glass-morphism interface.

## How to Run

No installation, build steps, or servers required!

1. Download the project files (`index.html`, `style.css`, `sim.js`).
2. Open `index.html` in any modern web browser (Chrome, Firefox, Edge, Safari).
3. Start simulating!

## Controls

| Control | Action |
| --- | --- |
| **Left Click + Drag** | Inject fluid (or Suck fluid, depending on mode). |
| **Toggle Switch** | Switch between **INJECT** (Blue) and **SUCK** (Red) modes. |
| **Fluid Dropdown** | Select the material to inject (Water / Oil / Honey). |
| **Gravity Slider** | Adjust gravity force. Center is 0g, Right is 1g, Left is Reverse Gravity. |
| **Add Obstacle** | Spawns a random rigid body (Stone, Log, or Leaf) into the tank. |
| **Clear Button** | Instantly removes all particles and obstacles. |

## Tech Stack

* **Core:** HTML5, CSS3
* **Logic:** Vanilla JavaScript (ES6+)
* **Rendering:** WebGL 1.0 (Custom shaders for high-performance point rendering)
* **Physics:** Custom FLIP/PIC implementation with rigid body collision resolution.

## Credits & Inspiration

* Core FLIP solver concepts adapted from **Matthias Müller's [Ten Minute Physics**](https://matthias-research.github.io/pages/tenMinutePhysics/).

---

*Enjoy the flow! 💧*