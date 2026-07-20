#!/usr/bin/env python3
"""Physically-realistic simulator for the Quantum-Tunneling Molecular Lattice (QTML).

QTML is a speculative 3D storage / in-memory-compute substrate:

  * Substrate : a 3D lattice of 3x3 carbide-nanotube bundles (structure + routing).
  * Storage   : artificial nucleic bases anchored to lattice nodes. Each base holds
                3 bits (an 8-state system, 0-7) instead of natural DNA's 2 bits.
  * Environment: submerged in superfluid helium-4 at cryogenic temperature.
  * Logic     : targeted electron pulses temporarily lower the potential barrier
                between nanotube walls, enabling *controlled* quantum tunneling for
                parallel computing. With the pulse off, tunneling must be prevented.

This simulator works entirely in **SI units with real physical constants** and models
the actual device physics:

  1. ``tunneling_probability`` -- the exact transmission coefficient through a
     rectangular potential barrier (real m*, barrier height in eV, width in nm),
     cross-checked against a WKB estimate.
  2. The **helium lambda-point mechanism (thermal anchoring)** -- the physically real
     role of superfluid He-II is extraordinary heat transport. Below the lambda point
     (T_lambda = 2.1768 K for He-4) the superfluid clamps every lattice node to the
     bath temperature; above it (He-I) the cooling capacity collapses, so a small
     parasitic heat load makes the node temperature *jump* (T_node = T_bath + Q/G(T),
     with the conductance G collapsing at lambda). A node is a quantum harmonic
     oscillator whose position variance ``(hbar/2 m w) coth(hbar w / 2 kB T_node)``
     grows with node temperature; because transmission is exponential in barrier
     width, the elevated node temperature enhances *unplanned* tunneling. The result
     is a sharp data-integrity cliff at the lambda point -- driven by the loss of
     superfluid cooling, not by any contrived mechanical mode.
  3. **Nine parallel channels** -- each inter-node link is a 3x3 nanotube bundle, i.e.
     9 independent tunneling channels; the link leak rate is 9x the single-channel rate.
  4. **Device metrics** -- carrier leakage rate ``R = channels * nu * <T>``, mean time
     between failures (MTBF), and retention-failure probability over a target lifetime.
  5. A Monte-Carlo bit-error model in which unplanned tunneling equilibrates charge
     between adjacent multi-level (0-7) bases by +/-1 level, tracking the bit-error
     rate (BER) and data integrity vs. temperature (binary or Gray encoding).
  6. A multi-geometry **data-density** benchmark (bits/nm^3, YB/m^3) across candidate
     lattice geometries and encoding depths.

Two device presets model the *same physical cell* differing only in parasitic heat
load (shielding):

  * ROBUST_DEVICE  -- low heat load: even when superfluid cooling is lost above lambda
    the node barely warms, so retention stays safe across the whole He range.
  * MARGINAL_DEVICE -- high heat load: losing superfluid cooling at lambda drives the
    node temperature up sharply, blowing the retention budget -- a decisive cliff.

Everything is pure Python standard library (no numpy/scipy/matplotlib). Output is a
console report, ASCII charts, and optional CSV export.

Run it::

    python3 scripts/qtml_simulator.py                 # full demo + CSVs
    python3 scripts/qtml_simulator.py --lambda 14     # probe the spec's old 14 K value
    python3 scripts/qtml_simulator.py --help
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# --------------------------------------------------------------------------- #
# Fundamental physical constants (SI, CODATA)
# --------------------------------------------------------------------------- #
HBAR = 1.054571817e-34       # reduced Planck constant   [J s]
M_E = 9.1093837015e-31       # electron rest mass        [kg]
K_B = 1.380649e-23           # Boltzmann constant        [J/K]
E_CHARGE = 1.602176634e-19   # elementary charge         [C]  (also J per eV)
SECONDS_PER_YEAR = 3.15576e7  # Julian year              [s]

LAMBDA_POINT_K = 2.1768      # He-4 superfluid lambda transition [K]

BITS_PER_BASE = 3            # 8-state base -> 3 bits
MAX_BASE_STATE = (1 << BITS_PER_BASE) - 1  # 7


# --------------------------------------------------------------------------- #
# Unit helpers
# --------------------------------------------------------------------------- #
def ev_to_j(ev: float) -> float:
    return ev * E_CHARGE


def j_to_ev(joule: float) -> float:
    return joule / E_CHARGE


def mev_to_j(mev: float) -> float:
    return mev * 1e-3 * E_CHARGE


def nm_to_m(nm: float) -> float:
    return nm * 1e-9


def m_to_nm(m: float) -> float:
    return m * 1e9


def _clamp01(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


# --------------------------------------------------------------------------- #
# Multi-level encoding helpers (binary vs Gray) for the charge-drift model
# --------------------------------------------------------------------------- #
def encode_level(level: int, encoding: str = "binary") -> int:
    """Encode an 8-state charge level (0-7) as bits.

    ``binary`` is the natural mapping; ``gray`` uses reflected Gray code so that a
    +/-1 level drift changes exactly one bit -- a real multi-level-cell mitigation.
    """
    if encoding == "gray":
        return level ^ (level >> 1)
    return level


def _hamming(x: int, y: int) -> int:
    return bin(x ^ y).count("1")


# --------------------------------------------------------------------------- #
# Device parameters
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class QTMLDevice:
    """Physical parameters of one QTML storage cell / inter-node barrier.

    Engineering units converted to SI internally. ``barrier_height_eV`` is the full
    barrier at ``barrier_potential == 1``; an electron pulse scales it toward zero.
    The thermal-anchoring fields model the superfluid-helium coolant: below the lambda
    point the node is clamped to the bath; above it a parasitic heat load raises the
    node temperature by ``above_lambda_dT_K`` (= heat load / He-I conductance), while
    ``superfluid_cooling_gain`` is the He-II heat-transport enhancement that makes the
    rise negligible in the superfluid phase.
    """

    name: str
    effective_mass_frac: float   # carrier effective mass  m*/m_e
    barrier_height_eV: float     # Phi_max (barrier_potential = 1.0)
    barrier_width_nm: float      # equilibrium barrier width a0
    fermi_energy_eV: float       # incident carrier energy E
    mode_energy_meV: float       # hbar*omega of the node's vibrational mode
    mode_mass_kg: float          # effective vibrating mass of a node
    attempt_frequency_hz: float  # carrier attempt-to-escape frequency nu
    retention_target_s: float    # design data-retention time
    above_lambda_dT_K: float     # node temp rise above lambda (heat load / He-I G)
    superfluid_cooling_gain: float = 1.0e5   # He-II heat-transport enhancement
    lambda_point_K: float = LAMBDA_POINT_K   # coolant superfluid transition
    channels_per_link: int = 9   # 3x3 nanotube walls -> 9 parallel tunneling channels

    @property
    def omega(self) -> float:
        """Angular frequency of the node's vibrational mode [rad/s]."""
        return mev_to_j(self.mode_energy_meV) / HBAR

    @property
    def zero_point_variance(self) -> float:
        """<x^2> of the quantum ground state, hbar / (2 m omega) [m^2]."""
        return HBAR / (2.0 * self.mode_mass_kg * self.omega)


# Literature-anchored barrier shared by both presets (a carbide inter-node barrier):
#   * m* ~ 1.0 m_e         : heavy-carrier / carbide tunneling mass (cf. SiC ~0.3, SiO2 ~0.4 m_e)
#   * Phi ~ 4.0 eV         : carbide band-offset / CNT work-function class
#                            (SiC gap ~2.4-3.2 eV; CNT work function ~4.5-5.0 eV, Shiraishi & Ata 2001)
#   * a0 = 3.4 nm          : retention-driven design width (min vdW wall spacing 0.335 nm,
#                            Saito/Dresselhaus; opaque enough for decade retention)
#   * hbar*omega = 0.4 meV : soft flexural anchor mode of the immersed node
#   * mode mass ~1.5e-26 kg: ~a few hundred amu (artificial base + local atoms)
#   * nu = 1e13 Hz         : phonon attempt-to-escape frequency
# The two presets are the SAME cell; they differ only in parasitic heat load (shielding).

# Low parasitic load: losing superfluid cooling only warms the node ~2 K -> stays safe.
ROBUST_DEVICE = QTMLDevice(
    name="robust",
    effective_mass_frac=1.0,
    barrier_height_eV=4.0,
    barrier_width_nm=3.4,
    fermi_energy_eV=0.1,
    mode_energy_meV=0.4,
    mode_mass_kg=1.5e-26,
    attempt_frequency_hz=1.0e13,
    retention_target_s=10.0 * SECONDS_PER_YEAR,
    above_lambda_dT_K=2.0,
)

# High parasitic load: losing superfluid cooling above lambda drives the node ~30 K
# hotter -> the retention budget is blown the instant the superfluid transition passes.
MARGINAL_DEVICE = QTMLDevice(
    name="marginal",
    effective_mass_frac=1.0,
    barrier_height_eV=4.0,
    barrier_width_nm=3.4,
    fermi_energy_eV=0.1,
    mode_energy_meV=0.4,
    mode_mass_kg=1.5e-26,
    attempt_frequency_hz=1.0e13,
    retention_target_s=10.0 * SECONDS_PER_YEAR,
    above_lambda_dT_K=30.0,
)

DEFAULT_DEVICE = ROBUST_DEVICE


# --------------------------------------------------------------------------- #
# 1. Quantum tunneling transmission (exact rectangular barrier, SI units)
# --------------------------------------------------------------------------- #
def wave_number_kappa(barrier_potential: float, device: QTMLDevice = DEFAULT_DEVICE) -> float:
    """Evanescent decay constant kappa = sqrt(2 m* Phi)/hbar  [1/m]."""
    phi = ev_to_j(max(0.0, barrier_potential) * device.barrier_height_eV)
    m = device.effective_mass_frac * M_E
    return math.sqrt(2.0 * m * phi) / HBAR if phi > 0 else 0.0


def tunneling_probability(
    barrier_potential: float,
    device: QTMLDevice = DEFAULT_DEVICE,
    incident_energy_eV: Optional[float] = None,
    width_nm: Optional[float] = None,
) -> float:
    """Exact transmission coefficient of a carrier through a rectangular barrier.

    Barrier height ``Phi = barrier_potential * device.barrier_height_eV`` (so electron
    pulses lowering ``barrier_potential`` raise transmission). Three regimes:

      * ``E < V0`` -- true tunneling (evanescent ``sinh`` form).
      * ``E == V0`` -- the removable-singularity limiting case.
      * ``E > V0`` -- over-barrier transmission (oscillatory ``sin`` form).

    Returns a probability in [0, 1].
    """
    V0 = ev_to_j(max(0.0, barrier_potential) * device.barrier_height_eV)
    E = ev_to_j(device.fermi_energy_eV if incident_energy_eV is None else incident_energy_eV)
    a = nm_to_m(device.barrier_width_nm if width_nm is None else width_nm)
    m = device.effective_mass_frac * M_E

    if V0 <= 0.0:
        return 1.0            # no barrier -> perfectly transparent
    if E <= 0.0:
        return 0.0            # a carrier with no energy cannot cross
    if a <= 0.0:
        return 1.0            # zero width -> transparent

    diff = V0 - E
    eps = 1e-4 * E            # numerical width of the E == V0 crossover

    if abs(diff) < eps:
        T = 1.0 / (1.0 + (m * a * a * V0) / (2.0 * HBAR * HBAR))
        return _clamp01(T)

    if E < V0:
        kappa = math.sqrt(2.0 * m * diff) / HBAR
        arg = kappa * a
        if arg > 300.0:
            # Deep-tunneling asymptote (sinh would overflow):
            #   T ~ (16 E (V0-E) / V0^2) * exp(-2 kappa a)
            T = (16.0 * E * diff / (V0 * V0)) * math.exp(-2.0 * arg)
        else:
            s = math.sinh(arg)
            T = 1.0 / (1.0 + (V0 * V0 * s * s) / (4.0 * E * diff))
    else:
        k = math.sqrt(2.0 * m * (E - V0)) / HBAR
        s = math.sin(k * a)
        T = 1.0 / (1.0 + (V0 * V0 * s * s) / (4.0 * E * (E - V0)))

    return _clamp01(T)


def wkb_transmission(
    barrier_potential: float,
    device: QTMLDevice = DEFAULT_DEVICE,
    width_nm: Optional[float] = None,
) -> float:
    """WKB transmission estimate, T ~ exp(-2 * integral kappa dx) = exp(-2 kappa a).

    Independent cross-check of :func:`tunneling_probability` in the thick-barrier
    (deep-tunneling) limit, where they agree up to the ``sinh`` prefactor.
    """
    a = nm_to_m(device.barrier_width_nm if width_nm is None else width_nm)
    kappa = wave_number_kappa(barrier_potential, device)
    return _clamp01(math.exp(-2.0 * kappa * a))


# --------------------------------------------------------------------------- #
# 2. Superfluid-helium thermal anchoring -- the lambda-point mechanism
# --------------------------------------------------------------------------- #
def superfluid_fraction(temperature_kelvin: float,
                        transition_temp: float = LAMBDA_POINT_K) -> float:
    """He-4 two-fluid superfluid fraction rho_s/rho.

    ``1 - (T/Tc)**5.6`` below the lambda point, 0 at/above it (empirical He-4 form;
    1 at T->0, 0 at Tc). Drives the coolant's heat-transport capacity.
    """
    if temperature_kelvin <= 0.0:
        return 1.0
    if temperature_kelvin >= transition_temp:
        return 0.0
    return max(0.0, 1.0 - (temperature_kelvin / transition_temp) ** 5.6)


def superfluid_active(temperature_kelvin: float,
                      transition_temp: float = LAMBDA_POINT_K) -> bool:
    """True when the coolant is in the superfluid (He-II) phase (below lambda)."""
    return temperature_kelvin < transition_temp


def node_temperature(bath_temperature_kelvin: float,
                     device: QTMLDevice = DEFAULT_DEVICE) -> float:
    """Steady-state node temperature given the bath temperature and thermal anchoring.

    ``T_node = T_bath + above_lambda_dT_K / (1 + gain * rho_s(T_bath))``. Below lambda
    the huge superfluid heat-transport gain makes the rise negligible (T_node ~ T_bath);
    above lambda rho_s -> 0 so the denominator -> 1 and the node jumps by the full
    He-I temperature rise. This is the physical origin of the lambda-point cliff.
    """
    fs = superfluid_fraction(bath_temperature_kelvin, device.lambda_point_K)
    return bath_temperature_kelvin + device.above_lambda_dT_K / (1.0 + device.superfluid_cooling_gain * fs)


def displacement_variance(
    temperature_kelvin: float,
    device: QTMLDevice = DEFAULT_DEVICE,
    include_thermal: bool = True,
) -> float:
    """Position variance <x^2> of a node modelled as a quantum harmonic oscillator.

    ``<x^2> = (hbar / 2 m omega) coth(hbar omega / 2 kB T)`` (zero-point + thermal).
    ``include_thermal=False`` (or T <= 0) returns just the zero-point floor.
    """
    zp = device.zero_point_variance
    if not include_thermal or temperature_kelvin <= 0.0:
        return zp
    x = HBAR * device.omega / (2.0 * K_B * temperature_kelvin)
    return zp / math.tanh(x)   # coth(x); -> 1 (pure zero-point) for large x


def effective_displacement_variance(
    bath_temperature_kelvin: float,
    device: QTMLDevice = DEFAULT_DEVICE,
) -> float:
    """Node displacement variance actually experienced, evaluated at the node temperature."""
    return displacement_variance(node_temperature(bath_temperature_kelvin, device), device, True)


# --------------------------------------------------------------------------- #
# 3. Barrier fluctuation -> effective (unplanned) transmission
# --------------------------------------------------------------------------- #
def effective_transmission(
    bath_temperature_kelvin: float,
    device: QTMLDevice = DEFAULT_DEVICE,
    barrier_potential: float = 1.0,
    quad_points: int = 801,
    quad_span: float = 8.0,
) -> float:
    """Transmission averaged over the node's thermal barrier-width fluctuations.

    The barrier width fluctuates as ``a = a0 - x`` with ``x ~ Normal(0, sigma)`` and
    ``sigma^2`` = :func:`effective_displacement_variance` (evaluated at the node
    temperature). Because transmission is exponential in width, we average the exact
    transmission over that distribution by deterministic Gaussian quadrature::

        <T> = integral T(a0 - x) N(x; 0, sigma) dx

    With the pulse off (``barrier_potential = 1``) this is the *unplanned* tunneling
    probability. Below lambda the node is clamped cold and <T> sits near its floor;
    above lambda the node heats, the distribution broadens, and <T> rises sharply.
    """
    sigma_m = math.sqrt(effective_displacement_variance(bath_temperature_kelvin, device))
    if sigma_m <= 0.0:
        return tunneling_probability(barrier_potential, device)

    sigma_nm = m_to_nm(sigma_m)
    a0 = device.barrier_width_nm
    lo = -quad_span * sigma_nm
    h = 2.0 * quad_span * sigma_nm / quad_points
    acc = 0.0
    norm = 0.0
    for i in range(quad_points + 1):
        x = lo + i * h
        weight = math.exp(-0.5 * (x / sigma_nm) ** 2)
        if i == 0 or i == quad_points:
            weight *= 0.5
        width = max(1e-3, a0 - x)   # clamp: barrier cannot go non-physical
        acc += weight * tunneling_probability(barrier_potential, device, width_nm=width)
        norm += weight
    return _clamp01(acc / norm) if norm > 0 else 0.0


def annealed_transmission(
    bath_temperature_kelvin: float,
    device: QTMLDevice = DEFAULT_DEVICE,
    barrier_potential: float = 1.0,
) -> float:
    """Small-fluctuation analytic approximation, <T> ~ T0 * exp(2 kappa^2 sigma^2).

    Independent cross-check of :func:`effective_transmission`; accurate only while
    ``kappa * sigma`` is small (it ignores the a >= 0 bound).
    """
    kappa = wave_number_kappa(barrier_potential, device)
    sigma2 = effective_displacement_variance(bath_temperature_kelvin, device)
    T0 = tunneling_probability(barrier_potential, device)
    return _clamp01(T0 * math.exp(2.0 * kappa * kappa * sigma2))


# --------------------------------------------------------------------------- #
# 4. Device / error metrics
# --------------------------------------------------------------------------- #
def single_channel_leak_rate(bath_temperature_kelvin: float,
                             device: QTMLDevice = DEFAULT_DEVICE) -> float:
    """Unplanned-tunneling rate through ONE channel, R1 = nu * <T>  [1/s]."""
    return device.attempt_frequency_hz * effective_transmission(bath_temperature_kelvin, device)


def leakage_rate(bath_temperature_kelvin: float, device: QTMLDevice = DEFAULT_DEVICE) -> float:
    """Unplanned-tunneling rate per LINK, R_link = channels_per_link * R1  [1/s].

    The 3x3 bundle presents ``channels_per_link`` independent, identical channels; a
    link leaks if any one tunnels (rare-event OR: 1-(1-p1)^n ~= n*p1).
    """
    return device.channels_per_link * single_channel_leak_rate(bath_temperature_kelvin, device)


def mtbf_seconds(
    bath_temperature_kelvin: float,
    device: QTMLDevice = DEFAULT_DEVICE,
    n_links: int = 1,
) -> float:
    """Mean time between unplanned-tunneling failures across ``n_links`` [s]."""
    total_rate = n_links * leakage_rate(bath_temperature_kelvin, device)
    return math.inf if total_rate <= 0.0 else 1.0 / total_rate


def retention_failure_probability(
    bath_temperature_kelvin: float,
    device: QTMLDevice = DEFAULT_DEVICE,
    n_links: int = 1,
) -> float:
    """Probability of at least one leak within the retention target (Poisson)."""
    total_rate = n_links * leakage_rate(bath_temperature_kelvin, device)
    return 1.0 - math.exp(-total_rate * device.retention_target_s)


def thermionic_fraction(temperature_kelvin: float, device: QTMLDevice = DEFAULT_DEVICE) -> float:
    """Boltzmann factor exp(-Phi / kB T) for over-barrier (thermionic) emission.

    Reported to document that this classical channel is negligible even at the elevated
    node temperatures reached above lambda (Phi ~ eV, kB T ~ meV), so tunneling dominates.
    """
    if temperature_kelvin <= 0.0:
        return 0.0
    return math.exp(-ev_to_j(device.barrier_height_eV) / (K_B * temperature_kelvin))


# --------------------------------------------------------------------------- #
# Lattice node
# --------------------------------------------------------------------------- #
@dataclass
class QTMLNode:
    """A single lattice node: a 3x3 carbide-nanotube bundle + its artificial base.

    ``base_type`` is the stored 3-bit datum (8-state charge level, 0-7).
    ``barrier_potential`` is the normalized isolation of the node's tunneling barrier:
    1.0 = full isolation (pulse off), 0.0 = barrier fully suppressed by an electron pulse.
    """

    position: Tuple[int, int, int]
    base_type: int
    lattice_structure: str = "3x3_carbide_nanotube"
    barrier_potential: float = 1.0
    neighbors: List["QTMLNode"] = field(default_factory=list, repr=False, compare=False)

    def __post_init__(self) -> None:
        if not isinstance(self.base_type, int) or isinstance(self.base_type, bool) \
                or not (0 <= self.base_type <= MAX_BASE_STATE):
            raise ValueError(
                f"base_type must be an integer in [0, {MAX_BASE_STATE}] "
                f"(3-bit state); got {self.base_type!r}"
            )

    def apply_electron_pulse(self, voltage: float) -> float:
        """Lower the barrier by ``voltage`` (clamped at 0) and return the new value."""
        self.barrier_potential -= voltage
        if self.barrier_potential < 0.0:
            self.barrier_potential = 0.0
        return self.barrier_potential

    def reset_barrier(self) -> None:
        """Restore full isolation (pulse off)."""
        self.barrier_potential = 1.0


# --------------------------------------------------------------------------- #
# Simulation environment
# --------------------------------------------------------------------------- #
class QTMLSimulationEnvironment:
    """A 3D QTML lattice plus its superfluid-helium environment."""

    def __init__(
        self,
        temperature_kelvin: float = 1.8,
        device: QTMLDevice = DEFAULT_DEVICE,
        encoding: str = "binary",
    ) -> None:
        self.temperature = temperature_kelvin   # bath temperature [K]
        self.device = device
        self.encoding = encoding
        self.fluid_state = "Helium_Superfluid"
        self.nodes: Dict[Tuple[int, int, int], QTMLNode] = {}
        self.edges: List[Tuple[QTMLNode, QTMLNode]] = []
        self._pristine: Dict[Tuple[int, int, int], int] = {}

    # -- construction ------------------------------------------------------- #
    @property
    def brownian_motion_factor(self) -> float:
        """Fraction of thermal (normal-fluid) coupling active = 1 - rho_s/rho."""
        return 1.0 - superfluid_fraction(self.temperature, self.device.lambda_point_K)

    def set_temperature(self, temperature_kelvin: float) -> None:
        self.temperature = temperature_kelvin
        self.fluid_state = (
            "Helium_Superfluid"
            if superfluid_active(temperature_kelvin, self.device.lambda_point_K)
            else "Helium_Normal_Fluid"
        )

    def add_node(self, position: Tuple[int, int, int], base_type: int) -> QTMLNode:
        node = QTMLNode(position=position, base_type=base_type)
        self.nodes[position] = node
        return node

    def _connect_neighbors(self) -> None:
        """Build a 6-neighbour (face-adjacent) 3D-grid adjacency and edge (link) list."""
        for node in self.nodes.values():
            node.neighbors = []
        self.edges = []
        offsets = [(1, 0, 0), (0, 1, 0), (0, 0, 1)]  # +x, +y, +z (each edge once)
        for pos, node in self.nodes.items():
            for dx, dy, dz in offsets:
                npos = (pos[0] + dx, pos[1] + dy, pos[2] + dz)
                other = self.nodes.get(npos)
                if other is not None:
                    node.neighbors.append(other)
                    other.neighbors.append(node)
                    self.edges.append((node, other))

    def build_lattice(self, size: Tuple[int, int, int] = (3, 3, 3), seed: int = 0) -> None:
        """Populate a ``size`` grid with random 3-bit bases and wire up adjacency."""
        rng = random.Random(seed)
        self.nodes = {}
        sx, sy, sz = size
        for x in range(sx):
            for y in range(sy):
                for z in range(sz):
                    self.add_node((x, y, z), rng.randint(0, MAX_BASE_STATE))
        self._connect_neighbors()
        self.snapshot()

    # -- state management --------------------------------------------------- #
    def snapshot(self) -> None:
        self._pristine = {pos: n.base_type for pos, n in self.nodes.items()}

    def restore(self) -> None:
        for pos, node in self.nodes.items():
            node.base_type = self._pristine[pos]
            node.reset_barrier()

    def total_bits(self) -> int:
        return len(self.nodes) * BITS_PER_BASE

    def bit_error_count(self) -> int:
        """Hamming distance (in the active encoding) between current and pristine data."""
        errors = 0
        for pos, node in self.nodes.items():
            errors += _hamming(encode_level(node.base_type, self.encoding),
                               encode_level(self._pristine[pos], self.encoding))
        return errors

    # -- physics queries ---------------------------------------------------- #
    def planned_tunneling_probability(self, a: QTMLNode, b: QTMLNode) -> float:
        """Tunneling across a link given the pair's *current* (pulse-lowered) barrier."""
        barrier = 0.5 * (a.barrier_potential + b.barrier_potential)
        return tunneling_probability(barrier, self.device)

    def unplanned_edge_rate(self) -> float:
        """Unplanned-tunneling event rate per link (all 9 channels) [1/s]."""
        return leakage_rate(self.temperature, self.device)

    def metrics(self) -> Dict[str, float]:
        """Snapshot of physical metrics at the current bath temperature."""
        n_links = max(1, len(self.edges))
        var_eff = effective_displacement_variance(self.temperature, self.device)
        t_node = node_temperature(self.temperature, self.device)
        return {
            "temperature": self.temperature,        # bath temperature
            "node_temperature": t_node,
            "superfluid_fraction": superfluid_fraction(self.temperature, self.device.lambda_point_K),
            "sigma_x_pm": math.sqrt(var_eff) * 1e12,
            "brownian_factor": self.brownian_motion_factor,
            "effective_transmission": effective_transmission(self.temperature, self.device),
            "leak_rate_per_s": self.unplanned_edge_rate(),
            "mtbf_years": mtbf_seconds(self.temperature, self.device, n_links) / SECONDS_PER_YEAR,
            "retention_fail": retention_failure_probability(self.temperature, self.device, n_links),
            "thermionic": thermionic_fraction(t_node, self.device),
        }

    # -- Monte-Carlo integrity model --------------------------------------- #
    def _charge_equilibrate(self, a: QTMLNode, b: QTMLNode, rng: random.Random) -> int:
        """One unplanned tunnelling event: move a charge quantum between adjacent bases.

        Charge flows from the higher level toward the lower (both drift by +/-1, clamped
        to [0, 7]); if equal, the direction is chosen at random. Returns the number of
        bit transitions (Hamming, in the active encoding) the event caused.
        """
        la, lb = a.base_type, b.base_type
        if la > lb:
            hi, lo = a, b
        elif lb > la:
            hi, lo = b, a
        else:
            hi, lo = (a, b) if rng.random() < 0.5 else (b, a)
        old_hi, old_lo = hi.base_type, lo.base_type
        hi.base_type = max(0, old_hi - 1)
        lo.base_type = min(MAX_BASE_STATE, old_lo + 1)
        enc = self.encoding
        return (_hamming(encode_level(old_hi, enc), encode_level(hi.base_type, enc))
                + _hamming(encode_level(old_lo, enc), encode_level(lo.base_type, enc)))

    def run(self, steps: int, dt_seconds: float, seed: int = 0) -> Dict[str, float]:
        """Advance the lattice ``steps`` ticks of ``dt_seconds``, corrupting bases.

        Each tick, every isolated (pulse-off) link leaks with Poisson probability
        ``p = 1 - exp(-R_link * dt)``. A leak equilibrates charge across the link
        (:meth:`_charge_equilibrate`). Returns integrity metrics; the empirical BER
        cross-checks the analytic leak rate.
        """
        rng = random.Random(seed)
        rate = self.unplanned_edge_rate()
        p = 1.0 - math.exp(-rate * dt_seconds)
        events = 0
        bit_flips = 0

        for _ in range(steps):
            for a, b in self.edges:
                if p > 0.0 and rng.random() < p:
                    events += 1
                    bit_flips += self._charge_equilibrate(a, b, rng)

        total_bits = self.total_bits()
        residual_errors = self.bit_error_count()
        m = self.metrics()
        m.update({
            "dt_seconds": dt_seconds,
            "steps": steps,
            "edge_probability": p,
            "events": events,
            "level_drift_events": events,
            "bit_flips": bit_flips,
            "ber": bit_flips / (total_bits * steps) if steps and total_bits else 0.0,
            "integrity": 1.0 - residual_errors / total_bits if total_bits else 1.0,
        })
        return m

    def temperature_sweep(
        self,
        temperatures: List[float],
        steps_per_point: int = 200,
        dt_seconds: float = 1.0,
        seed: int = 0,
    ) -> List[Dict[str, float]]:
        """Run the integrity model at each bath temperature, restoring between points."""
        results = []
        for i, T in enumerate(temperatures):
            self.restore()
            self.set_temperature(T)
            results.append(self.run(steps_per_point, dt_seconds, seed=seed + i))
        self.restore()
        return results


# --------------------------------------------------------------------------- #
# Sweeps + reporting helpers
# --------------------------------------------------------------------------- #
def barrier_sweep(device: QTMLDevice = DEFAULT_DEVICE, points: int = 21) -> List[Dict[str, float]]:
    """Exact and WKB transmission as the barrier is driven from isolation to zero."""
    out = []
    for i in range(points):
        barrier = 1.0 - i / (points - 1)
        out.append({
            "barrier_potential": barrier,
            "barrier_height_eV": barrier * device.barrier_height_eV,
            "exact": tunneling_probability(barrier, device),
            "wkb": wkb_transmission(barrier, device),
        })
    return out


def frange(start: float, stop: float, step: float) -> List[float]:
    vals, n = [], 0
    x = start
    while x <= stop + 1e-9:
        vals.append(round(x, 6))
        n += 1
        x = start + n * step
    return vals


def ascii_chart(pairs: List[Tuple[float, float]], width: int = 46,
                label: str = "value", vmax: Optional[float] = None,
                logscale: bool = False) -> str:
    """Render (x, y) pairs as a horizontal ASCII bar chart (optionally log-scaled)."""
    if not pairs:
        return "(no data)"

    def transform(y: float) -> float:
        if not logscale:
            return y
        return math.log10(y) if y > 0 else float("-inf")

    ys = [transform(y) for _, y in pairs]
    finite = [v for v in ys if v != float("-inf")]
    top = transform(vmax) if vmax is not None else (max(finite) if finite else 1.0)
    bottom = min(finite) if (logscale and finite) else 0.0
    span = (top - bottom) or 1.0

    lines = []
    for (x, y), ty in zip(pairs, ys):
        frac = 0.0 if ty == float("-inf") else max(0.0, min(1.0, (ty - bottom) / span))
        filled = int(round(width * frac))
        bar = "#" * filled + "." * (width - filled)
        lines.append(f"{x:8.2f} | {bar} | {y:.3e}")
    scale = " (log10)" if logscale else ""
    header = f"{'x':>8} | {label + scale:<{width}} | y"
    return "\n".join([header, "-" * len(header), *lines])


def write_csv(path: str, header: List[str], rows: List[List]) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)


def _fmt_years(years: float) -> str:
    if years == math.inf:
        return "inf"
    if years >= 1e6:
        return f"{years:.1e}yr"
    if years >= 1.0:
        return f"{years:.1f}yr"
    days = years * 365.25
    if days >= 1.0:
        return f"{days:.1f}d"
    return f"{days * 24:.2g}h"


# --------------------------------------------------------------------------- #
# F. Multi-geometry data-density benchmark
# --------------------------------------------------------------------------- #
# Candidate lattice geometries. Unit-cell volume is dx*dy*dz [nm^3] when dims are given,
# else `volume_nm3` directly. `channels` records the parallel tunneling channels/link.
LATTICE_GEOMETRIES: List[Dict[str, object]] = [
    {"name": "3x3_carbide_bundle", "dx": 1.0, "dy": 1.0, "dz": 0.335, "channels": 9},
    {"name": "1x1_swcnt_array", "dx": 0.5, "dy": 0.5, "dz": 0.335, "channels": 1},
    {"name": "2d_graphene_layer", "dx": 0.246, "dy": 0.246, "dz": 0.335, "channels": None},
    {"name": "3d_diamondoid_matrix", "volume_nm3": 0.00567, "channels": None},
]
DENSITY_BIT_DEPTHS = (2, 3, 4, 5)  # base-4, base-8, base-16, base-32
_NM3_PER_CM3 = 1e21
_NM3_PER_M3 = 1e27
_BYTES_PER_YB = 1e24


def geometry_cell_volume_nm3(geom: Dict[str, object]) -> float:
    """Unit-cell volume [nm^3] from explicit dims, else the stored site volume."""
    if "volume_nm3" in geom:
        return float(geom["volume_nm3"])
    return float(geom["dx"]) * float(geom["dy"]) * float(geom["dz"])


def calculate_lattice_data_density(
    bit_depths: Tuple[int, ...] = DENSITY_BIT_DEPTHS,
    baseline_name: str = "3x3_carbide_bundle",
    baseline_bits: int = 3,
) -> List[Dict[str, float]]:
    """Volumetric storage density for each (geometry, bit-depth).

    Metrics per row: bits/nm^3, bits/cm^3, yottabytes/m^3, and a relative scaling
    factor anchored to ``baseline_name`` at ``baseline_bits`` (the 3x3 carbide bundle
    at 3 bits). Pure arithmetic -- no physics coupling.
    """
    volumes = {g["name"]: geometry_cell_volume_nm3(g) for g in LATTICE_GEOMETRIES}
    baseline_density = baseline_bits / volumes[baseline_name]

    rows: List[Dict[str, float]] = []
    for geom in LATTICE_GEOMETRIES:
        vol = geometry_cell_volume_nm3(geom)
        for bits in bit_depths:
            bits_per_nm3 = bits / vol
            rows.append({
                "geometry": geom["name"],
                "channels": geom["channels"],
                "cell_volume_nm3": vol,
                "bits": bits,
                "bits_per_nm3": bits_per_nm3,
                "bits_per_cm3": bits_per_nm3 * _NM3_PER_CM3,
                "yb_per_m3": bits_per_nm3 * _NM3_PER_M3 / 8.0 / _BYTES_PER_YB,
                "scaling_vs_baseline": bits_per_nm3 / baseline_density,
            })
    return rows


def format_density_table(rows: List[Dict[str, float]]) -> str:
    """Render the density benchmark as an aligned ASCII table."""
    head = (f"{'geometry':22}{'ch':>4}{'vol(nm^3)':>11}{'bits':>5}"
            f"{'bits/nm^3':>12}{'bits/cm^3':>12}{'YB/m^3':>12}{'x base':>9}")
    lines = [head, "-" * len(head)]
    for r in rows:
        ch = "-" if r["channels"] is None else str(r["channels"])
        lines.append(f"{r['geometry']:22}{ch:>4}{r['cell_volume_nm3']:>11.5f}{r['bits']:>5}"
                     f"{r['bits_per_nm3']:>12.3f}{r['bits_per_cm3']:>12.3e}"
                     f"{r['yb_per_m3']:>12.3e}{r['scaling_vs_baseline']:>9.2f}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Demo / CLI
# --------------------------------------------------------------------------- #
def _report_device(device: QTMLDevice, temps: List[float], steps: int,
                   dt: float, seed: int, encoding: str) -> List[Dict[str, float]]:
    env = QTMLSimulationEnvironment(device=device, encoding=encoding)
    env.build_lattice((3, 3, 3), seed=seed)
    results = env.temperature_sweep(temps, steps_per_point=steps, dt_seconds=dt, seed=seed)
    kappa = wave_number_kappa(1.0, device)
    Tc = device.lambda_point_K

    print("\n" + "=" * 78)
    print(f"[{device.name.upper()} DEVICE]  Phi={device.barrier_height_eV} eV  "
          f"a0={device.barrier_width_nm} nm  m*={device.effective_mass_frac} m_e  "
          f"hw={device.mode_energy_meV} meV")
    print(f"  kappa = {kappa/1e9:.2f} /nm   {device.channels_per_link} channels/link   "
          f"above-lambda dT = {device.above_lambda_dT_K:.0f} K   "
          f"retention target = {_fmt_years(device.retention_target_s/SECONDS_PER_YEAR)}")

    print("\n  " + ascii_chart([(r["temperature"], r["retention_fail"]) for r in results],
                               label="retention-failure probability", vmax=1.0).replace("\n", "\n  "))

    print("\n   Tbath  fluid       Tnode   rho_s   sigma_x   <T>_unpl    R(1/s)     MTBF      Pfail   BER      integ")
    print("   " + "-" * 104)
    for r in results:
        mark = " <lambda" if abs(r["temperature"] - Tc) < 0.06 else ""
        fluid = "super " if superfluid_active(r["temperature"], Tc) else "normal"
        print(f"   {r['temperature']:5.2f}  {fluid}  {r['node_temperature']:6.1f}K  "
              f"{r['superfluid_fraction']:5.3f}  {r['sigma_x_pm']:6.1f}pm  "
              f"{r['effective_transmission']:.2e}  {r['leak_rate_per_s']:.2e}  "
              f"{_fmt_years(r['mtbf_years']):>9}  {r['retention_fail']:5.3f}  "
              f"{r['ber']:.2e}  {r['integrity']*100:5.1f}%{mark}")
    return results


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Realistic QTML quantum-tunneling simulator")
    parser.add_argument("--seed", type=int, default=1, help="RNG seed (default 1)")
    parser.add_argument("--steps", type=int, default=400,
                        help="Monte-Carlo ticks per temperature point (default 400)")
    parser.add_argument("--dt", type=float, default=1e6,
                        help="seconds per Monte-Carlo tick (default 1e6 ~ 11.6 days; "
                             "chosen so ticks x dt spans a retention-scale window)")
    parser.add_argument("--tmin", type=float, default=1.5, help="min bath temperature K (default 1.5)")
    parser.add_argument("--tmax", type=float, default=4.2, help="max bath temperature K (default 4.2)")
    parser.add_argument("--tstep", type=float, default=0.1, help="temperature step K (default 0.1)")
    parser.add_argument("--lambda", dest="lambda_k", type=float, default=None,
                        help="override the superfluid transition temperature (K)")
    parser.add_argument("--encoding", choices=("binary", "gray"), default="binary",
                        help="multi-level encoding for the corruption model (default binary)")
    parser.add_argument("--csv-dir", default=".", help="directory for CSV output (default cwd)")
    parser.add_argument("--no-csv", action="store_true", help="skip CSV export")
    args = parser.parse_args(argv)

    robust_dev, marginal_dev = ROBUST_DEVICE, MARGINAL_DEVICE
    if args.lambda_k is not None:
        from dataclasses import replace
        robust_dev = replace(robust_dev, lambda_point_K=args.lambda_k)
        marginal_dev = replace(marginal_dev, lambda_point_K=args.lambda_k)

    print("=" * 78)
    print("QTML Quantum-Tunneling Molecular Lattice -- Realistic Simulation Report")
    print("  (SI units, real physical constants; pure standard-library implementation)")
    print("=" * 78)

    # -- 1. Barrier sweep (planned, pulse-driven tunneling) ----------------- #
    bsweep = barrier_sweep(marginal_dev, points=21)
    print(f"\n[1] Tunneling vs. barrier potential  (exact rectangular barrier vs. WKB)")
    print("    barrier 1.0 = pulse off / isolated ; 0.0 = pulse fully applied\n")
    print(ascii_chart([(r["barrier_potential"], r["exact"]) for r in bsweep],
                      label="exact transmission", vmax=1.0))
    print(f"\n    isolated   (barrier=1.0): exact={tunneling_probability(1.0, marginal_dev):.3e}  "
          f"WKB={wkb_transmission(1.0, marginal_dev):.3e}")
    print(f"    fully open (barrier=0.0): exact={tunneling_probability(0.0, marginal_dev):.3e}")

    # -- 2. Temperature sweeps for both device presets ---------------------- #
    temps = frange(args.tmin, args.tmax, args.tstep)
    Tc = robust_dev.lambda_point_K
    print("\n" + "=" * 78)
    print(f"[2] Data integrity vs. bath temperature (3x3x3 lattice, 54 links, "
          f"{args.steps} ticks x {args.dt:g}s, {args.encoding} encoding)")
    print(f"    Superfluid lambda point = {Tc:.4f} K. Below it He-II clamps each node to")
    print("    the bath; above it cooling collapses and a parasitic heat load heats the node.")

    robust = _report_device(robust_dev, temps, args.steps, args.dt, args.seed, args.encoding)
    marginal = _report_device(marginal_dev, temps, args.steps, args.dt, args.seed, args.encoding)

    # -- 3. Findings -------------------------------------------------------- #
    print("\n" + "=" * 78)
    print("[3] Findings")
    r_max = max(r["retention_fail"] for r in robust)
    m_below = min(r["retention_fail"] for r in marginal if superfluid_active(r["temperature"], Tc))
    m_above = max(r["retention_fail"] for r in marginal)
    node_hot = max(r["node_temperature"] for r in marginal)
    print(f"  - Superfluid He-II clamps the node to the bath below {Tc:.2f} K; the "
          f"marginal node jumps to ~{node_hot:.0f} K once cooling collapses above it.")
    print(f"  - Robust cell (low heat load) stays safe across the whole He range: "
          f"retention-failure <= {r_max:.1e}.")
    print(f"  - Marginal cell (high heat load) is safe in the superfluid "
          f"(Pfail {m_below:.1e}) but fails at lambda (Pfail -> {m_above:.2f}).")
    print(f"  - Thermionic emission stays negligible even at the hot node: "
          f"exp(-Phi/kT) = {thermionic_fraction(node_hot, marginal_dev):.1e}.")

    # -- 4. Data-density benchmark ------------------------------------------ #
    density = calculate_lattice_data_density()
    print("\n" + "=" * 78)
    print("[4] Multi-geometry data-density benchmark (baseline: 3x3_carbide_bundle @ 3-bit)")
    print(format_density_table(density))

    # -- 5. CSV export ------------------------------------------------------ #
    if not args.no_csv:
        os.makedirs(args.csv_dir, exist_ok=True)
        bpath = os.path.join(args.csv_dir, "qtml_barrier_sweep.csv")
        write_csv(bpath,
                  ["barrier_potential", "barrier_height_eV", "exact_transmission", "wkb_transmission"],
                  [[r["barrier_potential"], r["barrier_height_eV"], r["exact"], r["wkb"]]
                   for r in bsweep])
        print(f"\n    CSV written: {bpath}")
        keys = ["temperature", "node_temperature", "superfluid_fraction", "sigma_x_pm",
                "effective_transmission", "leak_rate_per_s", "mtbf_years", "retention_fail",
                "ber", "integrity", "thermionic"]
        header = ["bath_temperature_K", "node_temperature_K", "superfluid_fraction", "sigma_x_pm",
                  "effective_transmission", "leak_rate_per_s", "mtbf_years", "retention_fail",
                  "ber", "integrity", "thermionic"]
        for label, res in (("robust", robust), ("marginal", marginal)):
            tpath = os.path.join(args.csv_dir, f"qtml_temperature_sweep_{label}.csv")
            write_csv(tpath, header, [[r[k] for k in keys] for r in res])
            print(f"    CSV written: {tpath}")
        dpath = os.path.join(args.csv_dir, "data_density_benchmark.csv")
        dkeys = ["geometry", "channels", "cell_volume_nm3", "bits", "bits_per_nm3",
                 "bits_per_cm3", "yb_per_m3", "scaling_vs_baseline"]
        write_csv(dpath, dkeys, [[r[k] for k in dkeys] for r in density])
        print(f"    CSV written: {dpath}")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
