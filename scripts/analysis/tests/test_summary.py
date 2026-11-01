from csat_stats.summary import distribution, histogram


def test_distribution_interpolates_percentiles():
    d = distribution([1, 2, 3, 4, 5])
    assert (d["n"], d["mean"], d["median"], d["p25"], d["p90"], d["min"], d["max"]) == (5, 3, 3, 2, 4.6, 1, 5)
    assert distribution([])["n"] == 0


def test_histogram_bins_and_open_top():
    assert histogram([0, 1, 1, 3, 9], [0, 1, 2, 5]) == [
        {"bin": "0", "count": 1},
        {"bin": "1", "count": 2},
        {"bin": "2-4", "count": 1},
        {"bin": "5+", "count": 1},
    ]
