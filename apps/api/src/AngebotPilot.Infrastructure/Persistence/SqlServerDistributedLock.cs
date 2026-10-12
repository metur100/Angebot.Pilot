using System.Data;
using AngebotPilot.Application.Background;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AngebotPilot.Infrastructure.Persistence;

/// <summary>Session-scoped SQL Server application lock (sp_getapplock). Released when the handle is disposed or the connection drops.</summary>
public sealed class SqlServerDistributedLock(IConfiguration configuration) : IDistributedLock
{
    public async Task<IAsyncDisposable?> TryAcquireAsync(string name, CancellationToken ct)
    {
        var connection = new SqlConnection(configuration.GetConnectionString("Default"));
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "sp_getapplock";
        command.CommandType = CommandType.StoredProcedure;
        command.Parameters.AddWithValue("@Resource", name);
        command.Parameters.AddWithValue("@LockMode", "Exclusive");
        command.Parameters.AddWithValue("@LockOwner", "Session");
        command.Parameters.AddWithValue("@LockTimeout", 0);
        var result = command.Parameters.Add("@Result", SqlDbType.Int);
        result.Direction = ParameterDirection.ReturnValue;
        await command.ExecuteNonQueryAsync(ct);
        if ((int)result.Value < 0)
        {
            await connection.DisposeAsync();
            return null;
        }

        return new Handle(connection, name);
    }

    private sealed class Handle(SqlConnection connection, string name) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try
            {
                await using var command = connection.CreateCommand();
                command.CommandText = "sp_releaseapplock";
                command.CommandType = CommandType.StoredProcedure;
                command.Parameters.AddWithValue("@Resource", name);
                command.Parameters.AddWithValue("@LockOwner", "Session");
                await command.ExecuteNonQueryAsync();
            }
            catch (SqlException)
            {
                // Closing the session releases the lock anyway.
            }
            finally
            {
                await connection.DisposeAsync();
            }
        }
    }
}
