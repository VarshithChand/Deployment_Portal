using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Npgsql;

namespace DeploymentAPI.Helpers;

// Where the Data Protection key ring (see Program.cs's AddDataProtection
// call and SettingsService's Protect/Unprotect) actually lives when
// DATABASE_URL is set. Without this, ASP.NET Core's default behavior
// persists keys to local disk, which - like the rest of this app's local
// filesystem - doesn't survive a Render redeploy. Losing the key ring
// doesn't just stop new encryption from working: every credential already
// encrypted under the lost key becomes permanently undecryptable. Storing
// keys in the same Postgres database everything else here already relies
// on for durability (see SettingsService's own portal_settings row) is
// what makes this safe across restarts/redeploys, the same reasoning that
// motivated DATABASE_URL for portal_settings in the first place.
//
// IXmlRepository's contract is synchronous (Data Protection calls this
// rarely - at startup and during periodic key rotation, never per-request)
// so plain blocking Npgsql calls here match the interface it implements,
// not a shortcut taken for convenience.
public class PostgresXmlRepository : IXmlRepository
{
    private readonly string _connectionString;

    public PostgresXmlRepository(string connectionString)
    {
        _connectionString = connectionString;
        EnsureTable();
    }

    private void EnsureTable()
    {
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        using var command = new NpgsqlCommand(
            "CREATE TABLE IF NOT EXISTS data_protection_keys (id SERIAL PRIMARY KEY, xml TEXT NOT NULL)",
            connection);

        command.ExecuteNonQuery();
    }

    public IReadOnlyCollection<XElement> GetAllElements()
    {
        var elements = new List<XElement>();

        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        using var command = new NpgsqlCommand("SELECT xml FROM data_protection_keys", connection);
        using var reader = command.ExecuteReader();

        while (reader.Read())
            elements.Add(XElement.Parse(reader.GetString(0)));

        return elements;
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        using var command = new NpgsqlCommand(
            "INSERT INTO data_protection_keys (xml) VALUES (@xml)", connection);

        command.Parameters.AddWithValue("xml", element.ToString());
        command.ExecuteNonQuery();
    }
}
