#!/usr/bin/env python3
"""Tests for the realistic QTML quantum-tunneling simulator (stdlib ``unittest``).

Run with either::

    python3 -m unittest scripts.test_qtml_simulator -v
    python3 scripts/test_qtml_simulator.py
"""

import math
import os
import sys
import unittest
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import qtml_simulator as q  # noqa: E402
from qtml_simulator import (  # noqa: E402
    HBAR,
    K_B,
    LAMBDA_POINT_K,
    M_E,
    MARGINAL_DEVICE,
    MAX_BASE_STATE,
    ROBUST_DEVICE,
    QTMLNode,
    QTMLSimulationEnvironment,
    annealed_transmission,
    calculate_lattice_data_density,
    displacement_variance,
    effective_transmission,
    encode_level,
    ev_to_j,
    geometry_cell_volume_nm3,
    j_to_ev,
    leakage_rate,
    m_to_nm,
    mtbf_seconds,
    nm_to_m,
    node_temperature,
    retention_failure_probability,
    single_channel_leak_rate,
    superfluid_active,
    superfluid_fraction,
    tunneling_probability,
    wave_number_kappa,
    wkb_transmission,
)


class TestUnits(unittest.TestCase):
    def test_ev_joule_roundtrip(self):
        self.assertAlmostEqual(j_to_ev(ev_to_j(2.5)), 2.5, places=12)

    def test_ev_value(self):
        self.assertAlmostEqual(ev_to_j(1.0), 1.602176634e-19, places=27)

    def test_nm_metre_roundtrip(self):
        self.assertAlmostEqual(m_to_nm(nm_to_m(3.7)), 3.7, places=12)

    def test_kappa_matches_hand_calculation(self):
        dev = ROBUST_DEVICE
        m = dev.effective_mass_frac * M_E
        expected = math.sqrt(2 * m * ev_to_j(dev.barrier_height_eV)) / HBAR
        self.assertAlmostEqual(wave_number_kappa(1.0, dev) / expected, 1.0, places=9)

    def test_kappa_scales_with_sqrt_barrier(self):
        ratio = wave_number_kappa(1.0, ROBUST_DEVICE) / wave_number_kappa(0.25, ROBUST_DEVICE)
        self.assertAlmostEqual(ratio, 2.0, places=6)


class TestTunnelingProbability(unittest.TestCase):
    def test_bounds_across_full_sweep(self):
        for dev in (ROBUST_DEVICE, MARGINAL_DEVICE):
            for i in range(101):
                p = tunneling_probability(i / 100.0, dev)
                self.assertGreaterEqual(p, 0.0)
                self.assertLessEqual(p, 1.0)

    def test_isolation_when_barrier_full(self):
        self.assertLess(tunneling_probability(1.0, ROBUST_DEVICE), 1e-15)

    def test_transparent_when_barrier_zero(self):
        self.assertEqual(tunneling_probability(0.0, ROBUST_DEVICE), 1.0)

    def test_monotonic_in_barrier(self):
        probs = [tunneling_probability(b / 100.0, MARGINAL_DEVICE) for b in range(100, 0, -1)]
        for earlier, later in zip(probs, probs[1:]):
            self.assertLess(earlier, later)

    def test_zero_energy_carrier_cannot_cross(self):
        self.assertEqual(tunneling_probability(1.0, ROBUST_DEVICE, incident_energy_eV=0.0), 0.0)

    def test_over_barrier_regime(self):
        p = tunneling_probability(0.01, MARGINAL_DEVICE, incident_energy_eV=1.0)
        self.assertGreater(p, 0.5)

    def test_thick_barrier_no_overflow(self):
        p = tunneling_probability(1.0, ROBUST_DEVICE, width_nm=50.0)
        self.assertGreaterEqual(p, 0.0)
        self.assertLessEqual(p, 1.0)


class TestWKBCrossCheck(unittest.TestCase):
    def test_wkb_close_to_exact_deep_tunneling(self):
        dev = MARGINAL_DEVICE
        ratio = tunneling_probability(1.0, dev) / wkb_transmission(1.0, dev)
        self.assertTrue(0.05 < ratio < 2.0, f"ratio={ratio}")

    def test_both_decay_with_slope_minus_two_kappa(self):
        dev = MARGINAL_DEVICE
        kappa = wave_number_kappa(1.0, dev)
        a1, a2 = 3.0, 3.5
        for fn in (tunneling_probability, wkb_transmission):
            t1 = fn(1.0, dev, width_nm=a1)
            t2 = fn(1.0, dev, width_nm=a2)
            slope = (math.log(t2) - math.log(t1)) / (nm_to_m(a2) - nm_to_m(a1))
            self.assertAlmostEqual(slope / (-2.0 * kappa), 1.0, delta=0.05)


class TestSuperfluidFraction(unittest.TestCase):
    def test_unity_at_zero(self):
        self.assertAlmostEqual(superfluid_fraction(1e-6), 1.0, places=9)

    def test_zero_at_and_above_lambda(self):
        self.assertEqual(superfluid_fraction(LAMBDA_POINT_K), 0.0)
        self.assertEqual(superfluid_fraction(3.0), 0.0)

    def test_monotonic_decreasing(self):
        vals = [superfluid_fraction(T) for T in [x / 100 for x in range(1, 218)]]
        for a, b in zip(vals, vals[1:]):
            self.assertGreaterEqual(a, b)

    def test_matches_power_law(self):
        Tc = LAMBDA_POINT_K
        for T in (0.5, 1.0, 1.5, 2.0):
            self.assertAlmostEqual(superfluid_fraction(T, Tc), 1 - (T / Tc) ** 5.6, places=9)

    def test_configurable_transition(self):
        self.assertGreater(superfluid_fraction(10.0, 14.0), 0.0)
        self.assertEqual(superfluid_fraction(14.0, 14.0), 0.0)


class TestNodeTemperature(unittest.TestCase):
    def test_clamped_to_bath_below_lambda(self):
        # Deep in the superfluid the node tracks the bath to within a small margin.
        for T in (1.5, 1.8, 2.0):
            self.assertAlmostEqual(node_temperature(T, MARGINAL_DEVICE), T, delta=0.05)

    def test_full_rise_above_lambda(self):
        T = 2.5
        self.assertAlmostEqual(node_temperature(T, MARGINAL_DEVICE),
                               T + MARGINAL_DEVICE.above_lambda_dT_K, places=6)

    def test_sharp_jump_across_lambda(self):
        below = node_temperature(2.1, MARGINAL_DEVICE)
        above = node_temperature(2.2, MARGINAL_DEVICE)
        self.assertLess(below, 3.0)
        self.assertGreater(above, 25.0)

    def test_configurable_lambda_moves_the_jump(self):
        dev = replace(MARGINAL_DEVICE, lambda_point_K=14.0)
        self.assertAlmostEqual(node_temperature(10.0, dev), 10.0, delta=0.1)   # still clamped
        self.assertGreater(node_temperature(15.0, dev), 40.0)                  # jumped


class TestThermalDisplacement(unittest.TestCase):
    def test_zero_point_floor_at_low_T(self):
        dev = MARGINAL_DEVICE
        self.assertAlmostEqual(displacement_variance(1e-6, dev) / dev.zero_point_variance, 1.0, places=9)

    def test_classical_limit_at_high_T(self):
        dev = MARGINAL_DEVICE
        T = 5000.0
        classical = K_B * T / (dev.mode_mass_kg * dev.omega ** 2)
        self.assertAlmostEqual(displacement_variance(T, dev) / classical, 1.0, places=2)

    def test_variance_monotonic_increasing(self):
        dev = MARGINAL_DEVICE
        vals = [displacement_variance(T, dev) for T in range(1, 200, 5)]
        for a, b in zip(vals, vals[1:]):
            self.assertLess(a, b)

    def test_include_thermal_false_is_zero_point(self):
        dev = MARGINAL_DEVICE
        self.assertEqual(displacement_variance(300.0, dev, include_thermal=False),
                         dev.zero_point_variance)


class TestEffectiveTransmission(unittest.TestCase):
    def test_rises_from_superfluid_to_normal(self):
        # Crossing lambda (node heats) sharply raises the unplanned transmission.
        cold = effective_transmission(2.0, MARGINAL_DEVICE)
        hot = effective_transmission(2.5, MARGINAL_DEVICE)
        self.assertGreater(hot, 1e3 * cold)

    def test_annealed_matches_quadrature_for_small_fluctuations(self):
        # Use a stiff, heavy mode so kappa*sigma is small and the two agree.
        stiff = replace(ROBUST_DEVICE, mode_energy_meV=60.0, mode_mass_kg=2.0e-25,
                        above_lambda_dT_K=0.0)
        for T in (1.5, 2.5):
            quad = effective_transmission(T, stiff)
            ann = annealed_transmission(T, stiff)
            self.assertAlmostEqual(quad / ann, 1.0, delta=0.05)


class TestDeviceMetrics(unittest.TestCase):
    def test_leakage_rate_includes_channel_factor(self):
        for T in (2.0, 2.5, 3.0):
            self.assertAlmostEqual(
                leakage_rate(T, MARGINAL_DEVICE),
                MARGINAL_DEVICE.channels_per_link * single_channel_leak_rate(T, MARGINAL_DEVICE),
                places=30)

    def test_mtbf_drops_across_lambda(self):
        self.assertGreater(mtbf_seconds(2.0, MARGINAL_DEVICE, 54),
                           mtbf_seconds(2.5, MARGINAL_DEVICE, 54))

    def test_retention_probability_bounds(self):
        for T in (1.5, 2.1, 2.3, 4.2):
            p = retention_failure_probability(T, MARGINAL_DEVICE, 54)
            self.assertGreaterEqual(p, 0.0)
            self.assertLessEqual(p, 1.0)

    def test_scenario_contrast(self):
        # Robust safe across the whole He range; marginal safe below lambda, fails above.
        self.assertLess(retention_failure_probability(4.2, ROBUST_DEVICE, 54), 1e-2)
        self.assertLess(retention_failure_probability(2.0, MARGINAL_DEVICE, 54), 0.05)
        self.assertGreater(retention_failure_probability(2.5, MARGINAL_DEVICE, 54), 0.9)


class TestNode(unittest.TestCase):
    def test_valid_base_types(self):
        for state in range(MAX_BASE_STATE + 1):
            self.assertEqual(QTMLNode(position=(0, 0, 0), base_type=state).base_type, state)

    def test_invalid_base_type_rejected(self):
        for bad in (-1, 8, 100, 3.5, "x", True):
            with self.assertRaises(ValueError):
                QTMLNode(position=(0, 0, 0), base_type=bad)

    def test_pulse_lowers_and_clamps(self):
        node = QTMLNode(position=(0, 0, 0), base_type=0)
        node.apply_electron_pulse(0.4)
        self.assertAlmostEqual(node.barrier_potential, 0.6)
        node.apply_electron_pulse(1.5)
        self.assertEqual(node.barrier_potential, 0.0)

    def test_reset_barrier(self):
        node = QTMLNode(position=(0, 0, 0), base_type=0)
        node.apply_electron_pulse(0.7)
        node.reset_barrier()
        self.assertEqual(node.barrier_potential, 1.0)


class TestChargeDriftCorruption(unittest.TestCase):
    def _pair_env(self, la, lb, encoding="binary"):
        env = QTMLSimulationEnvironment(encoding=encoding)
        a = env.add_node((0, 0, 0), la)
        b = env.add_node((1, 0, 0), lb)
        env.snapshot()
        return env, a, b

    def test_charge_moves_one_level_toward_neighbor(self):
        env, a, b = self._pair_env(5, 2)
        env._charge_equilibrate(a, b, __import__("random").Random(0))
        self.assertEqual(a.base_type, 4)   # higher steps down
        self.assertEqual(b.base_type, 3)   # lower steps up

    def test_clamped_at_bounds(self):
        env, a, b = self._pair_env(7, 7)
        env._charge_equilibrate(a, b, __import__("random").Random(0))
        levels = sorted((a.base_type, b.base_type))
        self.assertEqual(levels, [6, 7])   # one steps down, the +1 clamps at 7

    def test_gray_pm1_costs_one_bit(self):
        for level in range(MAX_BASE_STATE):
            self.assertEqual(
                bin(encode_level(level, "gray") ^ encode_level(level + 1, "gray")).count("1"), 1)

    def test_binary_pm1_can_cost_multiple_bits(self):
        # 3 -> 4 is 011 -> 100 in binary: 3 bits flip.
        self.assertEqual(bin(encode_level(3) ^ encode_level(4)).count("1"), 3)

    def test_hamming_counts_use_encoding(self):
        env, a, b = self._pair_env(0b000, 0b000, encoding="binary")
        a.base_type = 0b101
        self.assertEqual(env.bit_error_count(), 2)


class TestLatticeAndIntegrity(unittest.TestCase):
    def _env(self, device=MARGINAL_DEVICE, seed=1, encoding="binary"):
        env = QTMLSimulationEnvironment(device=device, encoding=encoding)
        env.build_lattice((3, 3, 3), seed=seed)
        return env

    def test_lattice_size_and_edges(self):
        env = self._env()
        self.assertEqual(len(env.nodes), 27)
        self.assertEqual(len(env.edges), 54)

    def test_integrity_perfect_in_superfluid(self):
        env = self._env()
        env.set_temperature(1.8)   # below lambda
        r = env.run(steps=400, dt_seconds=1e6, seed=7)
        self.assertEqual(r["bit_flips"], 0)
        self.assertEqual(r["ber"], 0.0)
        self.assertEqual(r["integrity"], 1.0)

    def test_integrity_degrades_above_lambda(self):
        env = self._env()
        env.set_temperature(2.5)   # above lambda
        r = env.run(steps=400, dt_seconds=1e6, seed=7)
        self.assertGreater(r["bit_flips"], 0)
        self.assertGreater(r["ber"], 0.0)
        self.assertLess(r["integrity"], 1.0)

    def test_determinism_same_seed(self):
        a = self._env().temperature_sweep([1.8, 2.3, 3.0], steps_per_point=200, dt_seconds=1e6, seed=5)
        b = self._env().temperature_sweep([1.8, 2.3, 3.0], steps_per_point=200, dt_seconds=1e6, seed=5)
        self.assertEqual([r["bit_flips"] for r in a], [r["bit_flips"] for r in b])

    def test_non_negative_counts(self):
        for r in self._env().temperature_sweep([1.5, 2.1, 2.3, 4.2], steps_per_point=100,
                                               dt_seconds=1e6, seed=2):
            self.assertGreaterEqual(r["events"], 0)
            self.assertGreaterEqual(r["bit_flips"], 0)
            self.assertTrue(0.0 <= r["integrity"] <= 1.0)

    def test_restore_returns_to_pristine(self):
        env = self._env()
        env.set_temperature(3.0)
        env.run(steps=400, dt_seconds=1e6, seed=1)
        self.assertGreater(env.bit_error_count(), 0)
        env.restore()
        self.assertEqual(env.bit_error_count(), 0)

    def test_mc_consistent_with_analytic_rate(self):
        env = self._env(seed=1)
        env.set_temperature(2.6)
        steps, dt = 400, 1e6
        p = 1.0 - math.exp(-leakage_rate(2.6, MARGINAL_DEVICE) * dt)
        expected = steps * len(env.edges) * p
        r = env.run(steps=steps, dt_seconds=dt, seed=11)
        self.assertGreater(expected, 10)
        self.assertLess(abs(r["events"] - expected), 5.0 * math.sqrt(expected) + 5)


class TestDataDensity(unittest.TestCase):
    def _rows(self):
        return calculate_lattice_data_density()

    def _density(self, name, bits):
        for r in self._rows():
            if r["geometry"] == name and r["bits"] == bits:
                return r["bits_per_nm3"]
        raise KeyError((name, bits))

    def test_swcnt_is_exactly_four_times_bundle(self):
        for bits in (2, 3, 4, 5):
            self.assertAlmostEqual(
                self._density("1x1_swcnt_array", bits) / self._density("3x3_carbide_bundle", bits),
                4.0, places=9)

    def test_diamondoid_exceeds_50x_baseline(self):
        for r in self._rows():
            if r["geometry"] == "3d_diamondoid_matrix" and r["bits"] == 3:
                self.assertGreater(r["scaling_vs_baseline"], 50.0)

    def test_all_densities_strictly_positive(self):
        for r in self._rows():
            self.assertGreater(r["bits_per_nm3"], 0.0)
            self.assertGreater(r["bits_per_cm3"], 0.0)
            self.assertGreater(r["yb_per_m3"], 0.0)

    def test_baseline_scaling_is_one(self):
        for r in self._rows():
            if r["geometry"] == "3x3_carbide_bundle" and r["bits"] == 3:
                self.assertAlmostEqual(r["scaling_vs_baseline"], 1.0, places=9)

    def test_cell_volume_from_dims(self):
        self.assertAlmostEqual(
            geometry_cell_volume_nm3({"dx": 1.0, "dy": 1.0, "dz": 0.335}), 0.335, places=9)


if __name__ == "__main__":
    unittest.main(verbosity=2)
